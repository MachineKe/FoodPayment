import { Controller, Post, Body } from '@nestjs/common';
import { MpesaService } from './mpesa.service';

@Controller('mpesa')
export class MpesaController {
    constructor(private readonly mpesaService: MpesaService) { }

    @Post('checkout')
    async checkout(@Body() body: { phoneNumber: string; amount: number; orderId: string }) {
        return this.mpesaService.initiateStkPush(body.phoneNumber, body.amount, body.orderId);
    }

    @Post('callback')
    async callback(@Body() body: any) {
        return this.mpesaService.handleCallback(body);
    }
}