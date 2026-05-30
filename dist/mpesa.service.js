"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var MpesaService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MpesaService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const axios_1 = require("@nestjs/axios");
const rxjs_1 = require("rxjs");
const supabase_js_1 = require("@supabase/supabase-js");
let MpesaService = MpesaService_1 = class MpesaService {
    constructor(configService, httpService) {
        this.configService = configService;
        this.httpService = httpService;
        this.logger = new common_1.Logger(MpesaService_1.name);
        this.supabase = (0, supabase_js_1.createClient)(this.configService.get('SUPABASE_URL'), this.configService.get('SUPABASE_SERVICE_ROLE_KEY'));
    }
    async getAccessToken() {
        const consumerKey = this.configService.get('MPESA_CONSUMER_KEY');
        const consumerSecret = this.configService.get('MPESA_CONSUMER_SECRET');
        const url = this.configService.get('MPESA_AUTH_URL');
        const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
        try {
            const response = await (0, rxjs_1.firstValueFrom)(this.httpService.get(url, {
                headers: {
                    Authorization: `Basic ${auth}`,
                },
            }));
            return response.data.access_token;
        }
        catch (error) {
            this.logger.error('Error getting M-PESA access token', error.response?.data || error.message);
            throw new common_1.HttpException('Failed to authenticate with M-PESA', common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async initiateStkPush(phoneNumber, amount, orderId) {
        const accessToken = await this.getAccessToken();
        const url = this.configService.get('MPESA_STK_PUSH_URL');
        const businessShortCode = this.configService.get('MPESA_SHORTCODE');
        const passkey = this.configService.get('MPESA_PASSKEY');
        const callbackUrl = this.configService.get('MPESA_CALLBACK_URL');
        const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
        const password = Buffer.from(`${businessShortCode}${passkey}${timestamp}`).toString('base64');
        const payload = {
            BusinessShortCode: businessShortCode,
            Password: password,
            Timestamp: timestamp,
            TransactionType: 'CustomerPayBillOnline',
            Amount: Math.ceil(amount),
            PartyA: phoneNumber,
            PartyB: businessShortCode,
            PhoneNumber: phoneNumber,
            CallBackURL: callbackUrl,
            AccountReference: `Order-${orderId}`,
            TransactionDesc: `Payment for order ${orderId}`,
        };
        try {
            const response = await (0, rxjs_1.firstValueFrom)(this.httpService.post(url, payload, {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            }));
            const checkoutRequestId = response.data.CheckoutRequestID;
            await this.supabase
                .from('orders')
                .update({ checkout_request_id: checkoutRequestId })
                .eq('id', orderId);
            return response.data;
        }
        catch (error) {
            this.logger.error('Error initiating STK push', error.response?.data || error.message);
            throw new common_1.HttpException('Failed to initiate M-PESA payment', common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async handleCallback(callbackData) {
        const stkCallback = callbackData?.Body?.stkCallback;
        if (!stkCallback)
            return;
        const checkoutRequestId = stkCallback.CheckoutRequestID;
        const resultCode = stkCallback.ResultCode;
        if (resultCode === 0) {
            await this.supabase
                .from('orders')
                .update({ status: 'New' })
                .eq('checkout_request_id', checkoutRequestId);
        }
        else {
            this.logger.warn(`Payment failed for Request ID: ${checkoutRequestId} - ${stkCallback.ResultDesc}`);
        }
    }
};
exports.MpesaService = MpesaService;
exports.MpesaService = MpesaService = MpesaService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        axios_1.HttpService])
], MpesaService);
//# sourceMappingURL=mpesa.service.js.map