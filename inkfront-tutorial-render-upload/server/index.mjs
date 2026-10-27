import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { WebSocketServer } from 'ws';
import { openStore, validateCredentials, checkPassword, hashPassword, publicUser, SESSION_MS } from './store.mjs';
import { createRooms } from './rooms.mjs';

const COOKIE='inkfront_session';
const ASSETS=new Map([['/',['index.html','text/html; charset=utf-8']],['/index.html',['index.html','text/html; charset=utf-8']],
  ...['game.js','arsenal.js','tutorial.js','online.js'].map(name=>[`/${name}`,[name,'text/javascript; charset=utf-8']]),
  ['/styles.css',['styles.css','text/css; charset=utf-8']]]);
const cookieToken=req=>{try{return req.headers.cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith(`${COOKIE}=`))?.slice(COOKIE.length+1);}catch{return null;}};
const httpError=(status,message)=>Object.assign(new Error(message),{status});
function rateLimit() {
  const buckets=new Map();
  return (key,max,windowMs)=>{
    const now=Date.now(); let bucket=buckets.get(key);
    if (!bucket || bucket.until<now) { bucket={count:0,until:now+windowMs}; buckets.set(key,bucket); }
    if(buckets.size>10000) for(const [id,entry] of buckets) if(entry.until<now) buckets.delete(id);
    if(buckets.size>20000) throw httpError(503,'The server is busy. Try again later.');
    if(++bucket.count>max) throw httpError(429,'Too many attempts. Please wait a few minutes.');
  };
}
async function jsonBody(req) {
  if(req.headers['content-type']?.split(';')[0]!=='application/json') throw httpError(415,'Send application/json.');
  let length=0; const chunks=[];
  for await(const chunk of req) { length+=chunk.length; if(length>4096) throw httpError(413,'Request too large.'); chunks.push(chunk); }
  try { const value=JSON.parse(Buffer.concat(chunks).toString()); if(!value||Array.isArray(value)||typeof value!=='object') throw Error(); return value; }
  catch { throw httpError(400,'Invalid JSON request.'); }
}

export async function createApp(options={}) {
  const production=options.production ?? process.env.NODE_ENV==='production';
  let origin=options.origin || process.env.APP_ORIGIN || process.env.RENDER_EXTERNAL_URL;
  if(production && (!origin || !origin.startsWith('https://'))) throw new Error('Set APP_ORIGIN to your HTTPS game URL (Render also supplies RENDER_EXTERNAL_URL).');
  if(origin) origin=new URL(origin).origin;
  const store=options.store || await openStore({production,...options.storeOptions});
  const dummyHash=await hashPassword('Not a real account password 7!');
  const rooms=createRooms(store,options.roomOptions);
  const limit=rateLimit();
  const assets=new Map();
  for(const [path,[file,type]] of ASSETS) assets.set(path,{type,body:await readFile(new URL(`../dist/${file}`,import.meta.url))});
  const sessionCookie=(token,clear=false)=>`${COOKIE}=${clear?'':token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${clear?0:SESSION_MS/1000}${production?'; Secure':''}`;
  const expectedOrigin=()=>origin;
  const clientIp=req=>production && process.env.RENDER ? (req.headers['x-forwarded-for']?.split(',').at(-1)?.trim() || req.socket.remoteAddress) : req.socket.remoteAddress;
  const checkOrigin=req=>{
    if(req.headers.origin!==expectedOrigin()) throw httpError(403,'Open the game from its own website and try again.');
    if(req.headers['sec-fetch-site']==='cross-site') throw httpError(403,'Cross-site request blocked.');
  };
  const server=createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','same-origin');
    res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
    const socketOrigin=(expectedOrigin()||'').replace(/^http/,'ws');
    res.setHeader('Content-Security-Policy',`default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ${socketOrigin}; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`);
    if(production) res.setHeader('Strict-Transport-Security','max-age=31536000');
    const json=(status,value,cookie)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...(cookie?{'Set-Cookie':cookie}:{})});res.end(JSON.stringify(value));};
    try {
      const path=new URL(req.url,'http://localhost').pathname;
      limit(`http:${clientIp(req)}`,600,60000);
      if(path==='/api/health'&&req.method==='GET') { await store.health(); return json(200,{ok:true}); }
      if(path.startsWith('/api/')) {
        if(req.method==='POST') checkOrigin(req);
        const token=cookieToken(req);
        const user=await store.authenticate(token);
        if(path==='/api/me'&&req.method==='GET') return json(200,{user:publicUser(user)});
        if(path==='/api/signup'||path==='/api/login') {
          if(req.method!=='POST') throw httpError(405,'Use POST.');
          limit(`auth:${clientIp(req)}`,15,15*60000);
          const creds=validateCredentials(await jsonBody(req));
          limit(`account:${creds.key}`,12,15*60000);
          let account;
          if(path==='/api/signup') {
            limit(`signup:${clientIp(req)}`,5,60*60000);
            account=await store.signup(creds.username,creds.key,creds.password);
          } else {
            account=await store.byName(creds.key);
            const valid=await checkPassword(creds.password,account?.password_hash || dummyHash);
            if(!account || !valid) throw httpError(401,'Username or password is incorrect.');
          }
          if(token) await store.logout(token);
          const next=await store.newSession(account.id);
          return json(200,{user:publicUser(account)},sessionCookie(next));
        }
        if(path==='/api/logout'&&req.method==='POST') {
          await jsonBody(req); await store.logout(token);
          if(user) rooms.revoke(user.id);
          return json(200,{ok:true},sessionCookie('',true));
        }
        if(path==='/api/password'&&req.method==='POST') {
          if(!user) throw httpError(401,'Sign in first.');
          limit(`password:${clientIp(req)}`,5,15*60000);
          const body=await jsonBody(req);
          if(typeof body.currentPassword!=='string'||body.currentPassword.length>128 || !(await checkPassword(body.currentPassword,user.password_hash))) throw httpError(401,'Current password is incorrect.');
          validateCredentials({username:user.username,password:body.password});
          await store.changePassword(user.id,body.password);
          rooms.revoke(user.id);
          const next=await store.newSession(user.id);
          return json(200,{ok:true},sessionCookie(next));
        }
        throw httpError(404,'Endpoint not found.');
      }
      if(!['GET','HEAD'].includes(req.method)) throw httpError(405,'Method not allowed.');
      const asset=assets.get(path);
      if(!asset) throw httpError(404,'Not found.');
      res.writeHead(200,{'Content-Type':asset.type,'Cache-Control':'no-cache','Content-Length':asset.body.length});
      res.end(req.method==='HEAD'?undefined:asset.body);
    } catch(error) {
      const status=error.status || 500;
      if(status===429) res.setHeader('Retry-After','900');
      if(status===500) process.stderr.write('Request failed; check database availability.\n');
      if(!res.headersSent) json(status,{error:status===500?'The server could not complete that request. Try again.':error.message});
      else res.end();
    }
  });
  server.requestTimeout=15000;
  server.headersTimeout=10000;
  const wss=new WebSocketServer({noServer:true,maxPayload:4096,perMessageDeflate:false});
  server.on('upgrade',async(req,socket,head)=>{
    socket.on('error',()=>{});
    try {
      if(new URL(req.url,'http://localhost').pathname!=='/socket') throw httpError(404,'Not found');
      checkOrigin(req);
      limit(`socket:${clientIp(req)}`,30,60000);
      if(wss.clients.size>=100) throw httpError(503,'Server full');
      const token=cookieToken(req);
      const user=await store.authenticate(token);
      if(!user) throw httpError(401,'Sign in first');
      if(socket.destroyed) return;
      wss.handleUpgrade(req,socket,head,ws=>{
        ws.isAlive=true; ws.sessionToken=token; ws.sessionExpires=Number(user.expires_at);
        ws.on('pong',()=>{ws.isAlive=true;});
        ws.on('error',()=>{});
        rooms.connect(user,ws);
      });
    } catch(error) { socket.end(`HTTP/1.1 ${error.status || 500} Rejected\r\nConnection: close\r\n\r\n`); }
  });
  const heartbeat=setInterval(()=>{
    for(const ws of wss.clients) {
      if(!ws.isAlive || Date.now()>ws.sessionExpires) { ws.terminate(); continue; }
      ws.isAlive=false; ws.ping();
      store.authenticate(ws.sessionToken).then(user=>{if(!user) ws.close(4003,'Session expired');}).catch(()=>ws.close(1013,'Database unavailable'));
    }
    void store.prune().catch(()=>{});
  },30000);
  heartbeat.unref();
  return {server,store,rooms,
    async listen(port=Number(process.env.PORT)||3000,host='0.0.0.0') {
      await new Promise((yes,no)=>{server.once('error',no);server.listen(port,host,yes);});
      origin ||= `http://127.0.0.1:${server.address().port}`;
      return origin;
    },
    async close() {
      clearInterval(heartbeat); rooms.close();
      for(const ws of wss.clients) ws.terminate();
      await new Promise(done=>wss.close(done));
      server.closeAllConnections();
      await new Promise(done=>server.close(done));
      await store.close();
    },
  };
}
if(process.argv[1] && pathToFileURL(resolve(process.argv[1])).href===import.meta.url) {
  try {
    const app=await createApp();
    const address=await app.listen();
    process.stdout.write(`Inkfront Arena ready: ${address}\n`);
    let closing=false;
    for(const signal of ['SIGINT','SIGTERM']) process.on(signal,async()=>{
      if(closing) return; closing=true; await app.close(); process.exit(0);
    });
  } catch(error) { process.stderr.write(`Startup failed: ${error.message}\n`); process.exitCode=1; }
}
