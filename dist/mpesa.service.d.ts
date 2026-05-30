import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
export declare class MpesaService {
    private configService;
    private httpService;
    private readonly logger;
    private supabase;
    constructor(configService: ConfigService, httpService: HttpService);
    getAccessToken(): Promise<string>;
    initiateStkPush(phoneNumber: string, amount: number, orderId: string): Promise<any>;
    handleCallback(callbackData: any): Promise<void>;
}
