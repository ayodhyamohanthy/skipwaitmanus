import {beforeEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({getUserByOpenId:vi.fn(),revokeUserSessions:vi.fn()}));
const {getUserByOpenId,revokeUserSessions}=mocks;
vi.mock('../db',()=>mocks);
vi.mock('./env',()=>({ENV:{cookieSecret:'test-secret-at-least-32-characters-long',appId:'skipwait-app'}}));
import {sdk} from './sdk';
import {SignJWT} from 'jose';
const key=new TextEncoder().encode('test-secret-at-least-32-characters-long');
beforeEach(()=>{getUserByOpenId.mockReset();revokeUserSessions.mockReset();getUserByOpenId.mockResolvedValue({sessionsValidAfter:new Date(0)})});
describe('session claims and revocation',()=>{
 it('accepts configured claims and limits access TTL to 30 days',async()=>{const token=await sdk.createSessionToken('user-1',{name:'User',expiresInMs:365*86400_000});expect(await sdk.verifySession(token)).toMatchObject({openId:'user-1',appId:'skipwait-app'});const [,p]=token.split('.');const body=JSON.parse(Buffer.from(p,'base64url').toString());expect(body.exp-body.iat).toBeLessThanOrEqual(30*86400)});
 it.each([['wrong issuer',{iss:'wrong',aud:'skipwait-web',appId:'skipwait-app'}],['wrong audience',{iss:'https://skipwait.me',aud:'wrong',appId:'skipwait-app'}],['wrong app',{iss:'https://skipwait.me',aud:'skipwait-web',appId:'wrong'}]])('rejects %s',async(_,c)=>{const now=Math.floor(Date.now()/1000);const t=await new SignJWT({openId:'user-1',appId:c.appId}).setProtectedHeader({alg:'HS256'}).setIssuer(c.iss).setAudience(c.aud).setSubject('user-1').setIssuedAt(now).setJti('x').setExpirationTime(now+60).sign(key);expect(await sdk.verifySession(t)).toBeNull()});
 it('refuses to mint a session for a suspended account',async()=>{getUserByOpenId.mockResolvedValue({suspended:true,sessionsValidAfter:new Date(0)});await expect(sdk.createSessionToken('user-1')).rejects.toThrow('ACCOUNT_NOT_ACTIVE')});
 it('fails issuance when suspension races token signing',async()=>{getUserByOpenId.mockResolvedValueOnce({suspended:false,sessionsValidAfter:new Date(0)}).mockResolvedValueOnce({suspended:true,sessionsValidAfter:new Date(1)});await expect(sdk.createSessionToken('user-1')).rejects.toThrow('ACCOUNT_NOT_ACTIVE')});
 it('rejects tokens issued before sessionsValidAfter',async()=>{const token=await sdk.createSessionToken('user-1');getUserByOpenId.mockResolvedValue({sessionsValidAfter:new Date(Date.now()+1000)});expect(await sdk.verifySession(token)).toBeNull()});
 it('accepts a token issued in the same database timestamp second',async()=>{vi.useFakeTimers();try{vi.setSystemTime(new Date('2026-09-19T00:00:00.900Z'));const token=await sdk.createSessionToken('user-1');getUserByOpenId.mockResolvedValue({sessionsValidAfter:new Date('2026-09-19T00:00:00.999Z')});expect(await sdk.verifySession(token)).toMatchObject({openId:'user-1'});}finally{vi.useRealTimers();}});
 it('does not revoke sessions using a forged logout cookie',async()=>{
  const token=await new SignJWT({openId:'victim',appId:'skipwait-app'}).setProtectedHeader({alg:'HS256'}).setIssuer('https://skipwait.me').setAudience('skipwait-web').setSubject('victim').setIssuedAt().setJti('forged').setExpirationTime('30m').sign(new TextEncoder().encode('attacker-controlled-key'));
  await sdk.revokeSession(token);
  expect(revokeUserSessions).not.toHaveBeenCalled();
 });
 it('revokes the subject on logout',async()=>{const token=await sdk.createSessionToken('user-1');await sdk.revokeSession(token);expect(revokeUserSessions).toHaveBeenCalledWith('user-1')});
 it('carries a hosted session id round trip and ignores anything that is not one',async()=>{
  expect((await sdk.verifySession(await sdk.createSessionToken('user-1',{sid:'session_ABC123'})))?.sid).toBe('session_ABC123');
  expect((await sdk.verifySession(await sdk.createSessionToken('user-1',{sid:'not-a-session'})))?.sid).toBeUndefined();
  expect((await sdk.verifySession(await sdk.createSessionToken('user-1')))?.sid).toBeUndefined();
 });
});
describe('sliding renewal (30-day idle, renewed daily; founder mandate Oct 16 2026, changeable)',()=>{
 const old=(ageSec:number)=>{const iat=Math.floor(Date.now()/1000)-ageSec;return new SignJWT({openId:'user-1',appId:'skipwait-app',name:'User'}).setProtectedHeader({alg:'HS256',typ:'JWT'}).setIssuer('https://skipwait.me').setAudience('skipwait-web').setSubject('user-1').setIssuedAt(iat).setJti('j'+ageSec).setExpirationTime(iat+30*86400).sign(key)};
 it('does not renew a fresh session and does no DB read',async()=>{const t=await old(60);expect(await sdk.renewSessionIfDue(t)).toBeNull();expect(getUserByOpenId).not.toHaveBeenCalled()});
 it('renews a session older than a day into a new 30-day token',async()=>{const t=await old(2*86400);const n=await sdk.renewSessionIfDue(t);expect(n).toBeTruthy();expect(n).not.toBe(t);const body=JSON.parse(Buffer.from(n!.split('.')[1],'base64url').toString());expect(body.exp-body.iat).toBe(30*86400);expect(await sdk.verifySession(n)).toMatchObject({openId:'user-1'})});
 it('never renews a revoked, suspended or expired session',async()=>{getUserByOpenId.mockResolvedValue({sessionsValidAfter:new Date()});expect(await sdk.renewSessionIfDue(await old(2*86400))).toBeNull();getUserByOpenId.mockResolvedValue({sessionsValidAfter:new Date(0),suspended:true});expect(await sdk.renewSessionIfDue(await old(2*86400))).toBeNull();expect(await sdk.renewSessionIfDue(await old(31*86400))).toBeNull();expect(await sdk.renewSessionIfDue('garbage')).toBeNull()});
});
