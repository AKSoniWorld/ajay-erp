import { OmitType, PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, Matches, ValidateNested } from 'class-validator';
import { GSTIN_REGEX, INDIAN_MOBILE_REGEX } from '@ajay/shared';

export class PrinterDto {
  @IsIn(['40x25', '50x25']) tagSize: '40x25' | '50x25';
  @IsIn(['usb', 'bluetooth', 'agent']) connection: 'usb' | 'bluetooth' | 'agent';
  @IsOptional() @IsString() deviceName?: string;
  @IsOptional() @IsIn(['ESCPOS', 'TSPL']) language?: 'ESCPOS' | 'TSPL';   // label printers: ESC/POS or TSPL
}

export class CreateBranchDto {
  @Matches(/^[A-Za-z0-9]{2,6}$/) code: string;
  @IsString() name: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @Matches(GSTIN_REGEX) gstin?: string;
  @IsOptional() @IsString() state?: string;
  @Matches(/^[A-Za-z0-9]{2,6}$/) invoicePrefix: string;
  @IsOptional() @Matches(INDIAN_MOBILE_REGEX) whatsappNumber?: string;
  @IsOptional() @IsIn(['AMOUNT', 'AMOUNT_AND_FINE_WEIGHT']) exchangeDisplay?: 'AMOUNT' | 'AMOUNT_AND_FINE_WEIGHT';
  @IsOptional() @IsIn(['A4', 'A5']) invoicePaper?: 'A4' | 'A5';
  @IsOptional() @IsIn(['A4', 'A5']) receiptPaper?: 'A4' | 'A5';
  @IsOptional() @IsBoolean() gstRegistered?: boolean;   // false = unregistered branch (bill of supply only)
  @IsOptional() @ValidateNested() @Type(() => PrinterDto) printer?: PrinterDto;
}

// code & invoicePrefix are immutable once created (invoice numbering depends on them).
export class UpdateBranchDto extends PartialType(OmitType(CreateBranchDto, ['code', 'invoicePrefix'] as const)) {
  @IsOptional() @IsBoolean() active?: boolean;
}
