const {chromium}=require(process.env.TEMP+'/hotel-ui-qa/node_modules/playwright');
const assert=require('node:assert/strict');
const Database=require('better-sqlite3');
(async()=>{
 const db=new Database(process.env.TEMP+'/hotel-ui-qa/test.db');
 const browser=await chromium.launch({headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 const p=await context.newPage(); const errors=[]; p.on('pageerror',e=>errors.push(e.message));
 await p.goto('http://localhost:3107/login'); await p.locator('[name=username]').fill('admin');await p.locator('[name=password]').fill('UiTest-Only-4927');await p.getByRole('button',{name:'Sign in',exact:true}).click();await p.waitForURL('**/dashboard');
 const stale=await context.newPage();
 for(const page of [p,stale]) {await page.goto('http://localhost:3107/restaurant/new?table=T01');await page.getByRole('button',{name:/Paneer Tikka/}).click();}
 await p.getByRole('button',{name:/Place order/}).click();await p.waitForURL(/\/restaurant\/\d+$/);const orderUrl=p.url(); const id=Number(orderUrl.split('/').pop());
 await stale.getByRole('button',{name:/Place order/}).click();await stale.getByText('This table already has an open order. Open that order to add items.',{exact:true}).waitFor();
 await p.getByRole('button',{name:'Mark served',exact:true}).click();await p.getByText('Order marked Served.',{exact:true}).waitFor();
 await p.locator('select[name=menu_item_id]').selectOption({label:'Paneer Tikka — ₹240.00'});
 await p.getByRole('button',{name:'Add',exact:true}).click();await p.getByText('Pending',{exact:true}).first().waitFor();
 const lines=db.prepare('SELECT kot_batch,kitchen_status FROM restaurant_order_items WHERE order_id=? ORDER BY id').all(id);assert.deepEqual(lines,[{kot_batch:1,kitchen_status:'served'},{kot_batch:2,kitchen_status:'pending'}]);
 await p.goto(`http://localhost:3107/print/order/${id}?kot=1`); await p.getByText('ROUND 2',{exact:true}).waitFor();assert.equal(await p.getByText('1 × Paneer Tikka',{exact:true}).count(),1);
 await p.goto(`http://localhost:3107/print/order/${id}?kot=1&batch=all`);assert.equal(await p.getByText('1 × Paneer Tikka',{exact:true}).count(),2);
 await p.goto(orderUrl);p.on('dialog',d=>d.accept());await p.getByRole('button',{name:'Cancel',exact:true}).click();await p.getByText('Cancelled',{exact:true}).first().waitFor();
 const last=db.prepare("SELECT id FROM restaurant_orders WHERE settlement='paid' ORDER BY id DESC LIMIT 1").get();
 await p.goto(`http://localhost:3107/print/order/${last.id}`);await p.getByLabel('Thermal paper width').selectOption('58');await p.emulateMedia({media:'print'});await p.locator('.thermal-container').screenshot({path:'artifacts/receipt-58mm.png'});await p.emulateMedia({media:'screen'});
 for(const route of ['dashboard','front-desk','bookings','rooms','guests','inventory','billing','expenses','reports','settings','restaurant','restaurant/menu','restaurant/kitchen']) {const response=await p.goto('http://localhost:3107/'+route);assert.equal(response.status(),200,route);assert.equal(await p.getByText('Something went wrong',{exact:false}).count(),0,route);}
 await p.goto('http://localhost:3107/dashboard');await p.screenshot({path:'artifacts/dashboard-desktop.png',fullPage:true});
 await p.setViewportSize({width:390,height:844});await p.goto('http://localhost:3107/restaurant/new?table=T01');assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await p.getByRole('button',{name:'Open menu'}).click();await p.getByRole('button',{name:'Close menu'}).click();
 assert.deepEqual(errors,[]);console.log('PASS: stale duplicate order rejected, served order reopened for new kitchen round, latest/all KOT separation, cancellation, 13 app routes, mobile POS and navigation.');
 await browser.close();db.close();
})().catch(e=>{console.error(e);process.exit(1)});
