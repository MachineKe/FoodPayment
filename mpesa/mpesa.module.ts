import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { MpesaService } from '../mpesa.service';
import { MpesaController } from '../mpesa.controller';

@Module({
    imports: [HttpModule],
    providers: [MpesaService],
    controllers: [MpesaController],
})
export class MpesaModule { }