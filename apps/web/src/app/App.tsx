import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { LoginPage } from '@/features/auth/LoginPage';
import { ComingNext, PLANNED } from '@/features/common/ComingNext';
import { HomePage } from '@/features/home/HomePage';
import { PosPage } from '@/features/pos/PosPage';
import { CustomerPage } from '@/features/customers/CustomerPage';
import { CustomersPage } from '@/features/customers/CustomersPage';
import { DairyPage } from '@/features/dairy/DairyPage';
import { SchemePage } from '@/features/dairy/SchemePage';
import { ReportsPage } from '@/features/reports/ReportsPage';
import { AuditPage } from '@/features/audit/AuditPage';
import { BranchesPage } from '@/features/branches/BranchesPage';
import { StaffPage } from '@/features/staff/StaffPage';
import { StockPage } from '@/features/stock/StockPage';
import { TransfersPage } from '@/features/transfers/TransfersPage';
import { SupplierPage } from '@/features/suppliers/SupplierPage';
import { SuppliersPage } from '@/features/suppliers/SuppliersPage';
import { CatalogPage } from '@/features/catalog/CatalogPage';
import { CatalogProduct } from '@/features/catalog/CatalogProduct';
import { BillDetail } from '@/features/bills/BillDetail';
import { BillsPage } from '@/features/bills/BillsPage';
import { ProductForm } from '@/features/products/ProductForm';
import { ProductsPage } from '@/features/products/ProductsPage';
import { RatesPage } from '@/features/rates/RatesPage';
import { SyncPage } from '@/features/sync/SyncPage';
import { refreshSession } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Shell } from './Shell';

/** Restores the session after a reload (the access token lives in memory only). Offline? Keep going on the saved sign-in. */
function Gate() {
  const { user, accessToken, logout } = useAuth();
  const [ready, setReady] = useState(!!accessToken || !user);
  useEffect(() => {
    if (ready) return;
    refreshSession().then(r => { if (r === 'denied') logout(); setReady(true); });
  }, [ready, logout]);
  if (!user) return <Navigate to="/login" replace />;
  if (!ready) return <div className="flex h-full items-center justify-center text-sm text-muted">Opening the shop…</div>;
  return <Shell />;
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/catalog" element={<CatalogPage />} />
        <Route path="/catalog/:sku" element={<CatalogProduct />} />
        <Route element={<Gate />}>
          <Route index element={<HomePage />} />
          <Route path="rates" element={<RatesPage />} />
          <Route path="pos" element={<PosPage />} />
          <Route path="sync" element={<SyncPage />} />
          <Route path="customers" element={<CustomersPage />} />
          <Route path="customers/:id" element={<CustomerPage />} />
          <Route path="dairy" element={<DairyPage />} />
          <Route path="dairy/:id" element={<SchemePage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="branches" element={<BranchesPage />} />
          <Route path="users" element={<StaffPage />} />
          <Route path="audit" element={<AuditPage />} />
          <Route path="inventory" element={<StockPage />} />
          <Route path="transfers" element={<TransfersPage />} />
          <Route path="suppliers" element={<SuppliersPage />} />
          <Route path="suppliers/:id" element={<SupplierPage />} />
          <Route path="invoices" element={<BillsPage />} />
          <Route path="invoices/:id" element={<BillDetail />} />
          <Route path="products" element={<ProductsPage />} />
          <Route path="products/new" element={<ProductForm />} />
          <Route path="products/:id" element={<ProductForm />} />
          {PLANNED.filter(p => !['pos', 'sync', 'products', 'invoices', 'customers', 'dairy', 'reports', 'branches', 'users', 'audit', 'inventory', 'transfers', 'suppliers'].includes(p.path)).map(p => <Route key={p.path} path={p.path} element={<ComingNext {...p} />} />)}
          <Route path="*" element={<div className="p-6"><h1 className="font-display text-2xl">Page not found</h1></div>} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
