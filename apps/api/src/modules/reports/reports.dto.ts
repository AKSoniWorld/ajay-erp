import { IsIn, IsMongoId, IsOptional, Matches } from 'class-validator';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
/** One query shape for every report; each report uses the filters that make sense for it. */
export class ReportQueryDto {
  @IsOptional() @Matches(DAY, { message: 'from must be YYYY-MM-DD' }) from?: string;
  @IsOptional() @Matches(DAY, { message: 'to must be YYYY-MM-DD' }) to?: string;
  @IsOptional() @IsMongoId() branchId?: string;
  @IsOptional() @IsIn(['json', 'csv', 'pdf']) format?: 'json' | 'csv' | 'pdf';
  @IsOptional() @IsIn(['day', 'month']) granularity?: 'day' | 'month';        // sales
  @IsOptional() @IsIn(['GST', 'NON_GST']) taxMode?: 'GST' | 'NON_GST';        // sales
  @IsOptional() @IsMongoId() customerId?: string;                              // customer ledger
  @IsOptional() @IsMongoId() supplierId?: string;                              // supplier ledger
  @IsOptional() @IsIn(['CASH', 'GOLD', 'SILVER']) account?: 'CASH' | 'GOLD' | 'SILVER'; // supplier ledger
  @IsOptional() @IsIn(['OPENING', 'PURCHASE', 'SALE', 'TRANSFER_OUT', 'TRANSFER_IN', 'ADJUST', 'RETURN']) type?: string; // stock movement
  @IsOptional() @IsMongoId() productId?: string;                               // stock movement
}
