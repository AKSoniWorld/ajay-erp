import 'reflect-metadata';
import { ConflictException } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AuthUser } from '@ajay/shared';
import { AppModule } from './app.module';
import { env } from './config';
import { BranchesService } from './modules/branches/branches.service';
import { CategoriesService } from './modules/catalog/categories.service';
import { ProductsService } from './modules/catalog/products.service';
import { CustomersService } from './modules/customers/customers.service';
import { InventoryService } from './modules/inventory/inventory.service';
import { RatesService } from './modules/rates/rates.service';
import { UsersService } from './modules/users/users.service';

/**
 * Starter data.  `npm run seed`  (in Docker: docker compose exec api node dist/seed.js)
 *  • always (idempotent): two branches (only if there are none) and the category tree
 *  • only with SEED_DEMO=true: sample products, stock, SAMPLE rates and a sample customer — never use in production
 */
async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn', 'log'] });
  const get = <T>(c: new (...a: any[]) => T) => app.get(c, { strict: false });
  const users = get(UsersService), branches = get(BranchesService), cats = get(CategoriesService), products = get(ProductsService);
  const inventory = get(InventoryService), rates = get(RatesService), customers = get(CustomersService);

  const admin = env.ADMIN_MOBILE ? await users.findByMobileWithSecrets(env.ADMIN_MOBILE) : null;
  if (!admin) throw new Error('Admin user not found. Set ADMIN_MOBILE and ADMIN_PASSWORD, start the API once, then run the seed again.');
  const actor: AuthUser = { id: String(admin._id), name: admin.name, role: 'ADMIN', branchIds: [] };

  // --- branches (only when none exist) ---
  let list: any[] = await branches.list(actor);
  if (!list.length) {
    await branches.create({ code: 'RNC1', name: 'Ajay Jewellers - Main', address: 'Ranchi', invoicePrefix: 'RNC1', state: 'Jharkhand' } as any, actor.id);
    await branches.create({ code: 'RNC2', name: 'Ajay Jewellers - Branch 2', address: 'Ranchi', invoicePrefix: 'RNC2', state: 'Jharkhand' } as any, actor.id);
    list = await branches.list(actor);
    console.log('Created 2 branches. Open Branches and set each branch’s GSTIN, address and GST registration.');
  } else console.log(`Branches already exist (${list.length}) — left as they are.`);

  // --- category tree (skips names that already exist) ---
  const tree: Record<string, string[]> = {
    'Gold Jewellery': ['Chains', 'Rings', 'Earrings', 'Bangles', 'Necklaces', 'Pendants'],
    'Silver Jewellery': ['Anklets', 'Bangles', 'Utensils & Gifts'],
    'Diamond Jewellery': ['Rings', 'Earrings', 'Pendants'],
  };
  for (const [name, subs] of Object.entries(tree)) {
    const ignore = (e: unknown) => { if (!(e instanceof ConflictException)) throw e; };
    await cats.create({ name }).catch(ignore);
  }
  let t: any[] = await cats.tree();
  for (const [name, subs] of Object.entries(tree)) {
    const root = t.find(r => r.name === name);
    for (const s of subs) if (root && !root.children.some((c: any) => c.name === s))
      await cats.create({ name: s }, String(root._id)).catch(e => { if (!(e instanceof ConflictException)) throw e; });
  }
  t = await cats.tree();
  console.log('Category tree ready.');

  // --- demo data ---
  if (env.SEED_DEMO !== 'true') { console.log('SEED_DEMO is not "true" — no demo products, rates or customers added.'); await app.close(); return; }
  if ((await products.list({ page: 1, limit: 1 } as any)).total > 0) { console.log('Products already exist — demo data skipped.'); await app.close(); return; }
  const cat = (n: string) => t.find(r => r.name === n), sub = (n: string, s: string) => cat(n).children.find((c: any) => c.name === s);
  const demo = [
    { name: 'Gold Chain 22K', c: 'Gold Jewellery', s: 'Chains', metal: 'GOLD', karat: 22, grossMg: 12_000, netMg: 11_500, makingType: 'PER_GRAM', makingValue: 50_000 },
    { name: 'Gold Ring 18K', c: 'Gold Jewellery', s: 'Rings', metal: 'GOLD', karat: 18, grossMg: 3_500, netMg: 3_200, makingType: 'FLAT', makingValue: 80_000 },
    { name: 'Silver Anklet', c: 'Silver Jewellery', s: 'Anklets', metal: 'SILVER', purityPct: 92.5, grossMg: 40_000, netMg: 38_000, makingType: 'PERCENT', makingValue: 1_200 },
  ];
  for (const d of demo) {
    const p: any = await products.create({ name: d.name, categoryId: String(cat(d.c)._id), subcategoryId: String(sub(d.c, d.s)._id), metal: d.metal,
      karat: (d as any).karat, purityPct: (d as any).purityPct, grossMg: d.grossMg, netMg: d.netMg, makingType: d.makingType, makingValue: d.makingValue } as any, actor.id);
    for (const [i, b] of list.entries()) await inventory.adjust({ productId: String(p._id), branchId: String(b._id), qty: i === 0 ? 5 : 2, type: 'OPENING' }, actor.id);
  }
  const sample = (metal: 'GOLD' | 'SILVER', karat: 22 | 18 | 24 | undefined, kind: 'SALE' | 'EXCHANGE' | 'MARKET', r: number) =>
    rates.set({ metal, karat, kind, ratePerGramPaise: r, reason: 'DEMO rate — replace with the real rate', confirmLargeChange: true } as any, actor.id);
  await sample('GOLD', 22, 'SALE', 700_000); await sample('GOLD', 18, 'SALE', 575_000); await sample('GOLD', 22, 'EXCHANGE', 650_000);
  await sample('GOLD', 24, 'MARKET', 760_000); await sample('SILVER', undefined, 'SALE', 9_500); await sample('SILVER', undefined, 'MARKET', 9_000);
  await customers.create({ name: 'Demo Customer', mobile: '9000000000' } as any, actor.id).catch(() => undefined);
  console.log('Demo products, stock, SAMPLE rates and a sample customer added. Replace the rates before real use!');
  await app.close();
}
main().catch(e => { console.error(e); process.exit(1); });
