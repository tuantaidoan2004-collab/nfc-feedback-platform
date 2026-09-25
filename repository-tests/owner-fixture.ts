import { randomBytes,randomUUID,createHash } from 'node:crypto';
import type { Pool } from 'pg';
import { OwnerAuth } from '../lib/owner/auth';
import { PublishingAdmin,PublishingResolver,type PageRef } from '../lib/publishing/repository';
import { defaultConfig } from '../lib/publishing/config';
import { publishingVisitPolicy } from '../lib/publishing/visit-policy';
import { VisitRatingRepository } from '../lib/repositories/visit-ratings';
export async function ownerFixture(db:Pool){
 const admin=new PublishingAdmin(db,async()=>({actorId:'local-fixture'}));
 const template=await admin.createTemplate(`fixture-${randomUUID()}`,1);
 const shops:string[]=[],pages:PageRef[]=[];
 for(const slug of ['one','two']){const shop=(await db.query('INSERT INTO shops(slug,name)VALUES($1,$2)RETURNING id',[slug,`Shop ${slug}`])).rows[0].id;shops.push(shop);const page=await admin.createPage(shop,template,defaultConfig(`Shop ${slug}`),slug);pages.push(page);await admin.publish(page,1);}
 const auth=new OwnerAuth(db),users=[];
 for(let i=0;i<2;i++){const username=`owner-${randomUUID().slice(0,8)}`,password=randomBytes(20).toString('hex');const id=await auth.bootstrap(username,password,async()=>{});
 await db.query("INSERT INTO owner_memberships_v2(user_id,shop_id,role)VALUES($1,$2,'owner')",[id,shops[i]]);const session=await auth.login(username,password);users.push({id,username,password,token:session.token});}
 return {db,admin,auth,shops,pages,users};
}
/** score null: the customer sent private feedback without choosing a star. */
export async function addExperience(db:Pool,slug='one',score:number|null=2,message:string|null='Private fixture',at?:Date,phone?:string){
 const c=(await new PublishingResolver(db).live({slug})).context;
 const hash=createHash('sha256').update(randomUUID()).digest('hex'),repo=new VisitRatingRepository(db,at?()=>at:undefined,publishingVisitPolicy(c));
 const v=await repo.registerVisit(c,randomUUID(),'load',hash);
 if(score!==null)await repo.recordRating({...c,visitId:v.visit.visitId},{intentId:randomUUID(),expectedRevision:0,score},hash);
 if(message)await repo.recordPrivateFeedback({...c,visitId:v.visit.visitId},{intentId:randomUUID(),expectedRevision:score===null?0:1,topic:'other',message,...(phone?{phone}:{})},hash);
 return {...v,context:c,hash,repo};
}

/**
 * Turns the second factor on for an administrator the way a real enrolment leaves the row, so fixtures can get past
 * the check that every administrative call now makes (lát A2). Tests that exercise the second factor itself go
 * through `AdminAuth` instead; this is for the many tests whose subject is something else entirely.
 */
export async function enrolAdmin(db: Pool, username = 'tai') {
  const { seal, newSecret } = await import('../lib/admin/totp');
  const secret = newSecret();
  await db.query('UPDATE platform_admins SET totp_secret=$2,totp_enrolled_at=clock_timestamp() WHERE username=$1', [username, seal(secret)]);
  return secret;
}
