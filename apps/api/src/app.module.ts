import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { env } from './config';
import { HealthController } from './health.controller';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { BranchScopeGuard } from './common/guards/branch-scope.guard';
import { AuditInterceptor } from './common/interceptors/audit.interceptor';
import { AuditModule } from './modules/audit/audit.module';
import { BranchesModule } from './modules/branches/branches.module';
import { UsersModule } from './modules/users/users.module';
import { AuthModule } from './modules/auth/auth.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { RatesModule } from './modules/rates/rates.module';
import { CustomersModule } from './modules/customers/customers.module';
import { ExchangeModule } from './modules/exchange/exchange.module';
import { AccountsModule } from './modules/accounts/accounts.module';
import { DairyModule } from './modules/dairy/dairy.module';
import { PrintModule } from './modules/print/print.module';
import { SuppliersModule } from './modules/suppliers/suppliers.module';
import { TransfersModule } from './modules/transfers/transfers.module';
import { ReportsModule } from './modules/reports/reports.module';
import { SyncModule } from './modules/sync/sync.module';
import { PublicModule } from './modules/public/public.module';
import { PosModule } from './modules/pos/pos.module';
import { InventoryModule } from './modules/inventory/inventory.module';

@Module({
  imports: [
    MongooseModule.forRoot(env.MONGO_URI),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    AuditModule, BranchesModule, UsersModule, AuthModule, CatalogModule, InventoryModule, RatesModule, CustomersModule, ExchangeModule, DairyModule, AccountsModule, PrintModule, SuppliersModule, TransfersModule, ReportsModule, SyncModule, PublicModule, PosModule,
  ],
  controllers: [HealthController],
  providers: [
    // Guard order = execution order: throttle → authenticate → role/permission → branch scope
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_GUARD, useClass: BranchScopeGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule {}
