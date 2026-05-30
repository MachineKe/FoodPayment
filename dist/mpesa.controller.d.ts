import { MpesaService } from './mpesa.service';
export declare class MpesaController {
    private readonly mpesaService;
    constructor(mpesaService: MpesaService);
    checkout(body: {
        phoneNumber: string;
        amount: number;
        orderId: string;
    }): Promise<any>;
    callback(body: any): Promise<void>;
}
