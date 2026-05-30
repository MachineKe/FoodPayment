import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as WebSocket from 'ws';

@Injectable()
export class MpesaService {
    private readonly logger = new Logger(MpesaService.name);
    private supabase: SupabaseClient;

    constructor(
        private configService: ConfigService,
        private httpService: HttpService,
    ) {
        this.supabase = createClient(
            this.configService.get<string>('SUPABASE_URL')!,
            this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY')!,
            {
                auth: {
                    persistSession: false,
                },
                realtime: {
                    transport: WebSocket as any,
                }
            }
        );
    }

    async getAccessToken(): Promise<string> {
        const consumerKey = this.configService.get<string>('MPESA_CONSUMER_KEY');
        const consumerSecret = this.configService.get<string>('MPESA_CONSUMER_SECRET');
        const url = this.configService.get<string>('MPESA_AUTH_URL')!;

        const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');

        try {
            const response = await firstValueFrom(
                this.httpService.get(url, {
                    headers: {
                        Authorization: `Basic ${auth}`,
                    },
                }),
            );
            return response.data.access_token;
        } catch (error: any) {
            this.logger.error('Error getting M-PESA access token', error.response?.data || error.message);
            throw new HttpException('Failed to authenticate with M-PESA', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    async initiateStkPush(phoneNumber: string, amount: number, orderId: string): Promise<any> {
        const accessToken = await this.getAccessToken();
        const url = this.configService.get<string>('MPESA_STK_PUSH_URL')!;
        const businessShortCode = this.configService.get<string>('MPESA_SHORTCODE');
        const passkey = this.configService.get<string>('MPESA_PASSKEY');
        const callbackUrl = this.configService.get<string>('MPESA_CALLBACK_URL');

        // Format phone number to 254XXXXXXXXX
        let formattedPhone = phoneNumber.replace(/\D/g, ''); // Remove non-numeric characters like '+'
        if (formattedPhone.startsWith('0')) {
            formattedPhone = `254${formattedPhone.slice(1)}`;
        } else if (formattedPhone.length === 9) { // Handles inputs like 722000000
            formattedPhone = `254${formattedPhone}`;
        }

        // Format timestamp as YYYYMMDDHHmmss
        const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
        const password = Buffer.from(`${businessShortCode}${passkey}${timestamp}`).toString('base64');

        const payload = {
            BusinessShortCode: businessShortCode,
            Password: password,
            Timestamp: timestamp,
            TransactionType: 'CustomerPayBillOnline',
            Amount: Math.ceil(amount), // M-PESA requires integer amounts
            PartyA: formattedPhone,
            PartyB: businessShortCode,
            PhoneNumber: formattedPhone,
            CallBackURL: callbackUrl,
            AccountReference: `Order-${orderId}`,
            TransactionDesc: `Payment for order ${orderId}`,
        };

        try {
            const response = await firstValueFrom(
                this.httpService.post(url, payload, {
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                    },
                }),
            );

            // Log the CheckoutRequestID to Supabase to track this order's payment
            const checkoutRequestId = response.data.CheckoutRequestID;

            await this.supabase
                .from('orders')
                .update({ checkout_request_id: checkoutRequestId })
                .eq('id', orderId);

            return response.data;
        } catch (error: any) {
            this.logger.error('Error initiating STK push', error.response?.data || error.message);
            throw new HttpException('Failed to initiate M-PESA payment', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    async handleCallback(callbackData: any): Promise<void> {
        const stkCallback = callbackData?.Body?.stkCallback;
        if (!stkCallback) return;

        const checkoutRequestId = stkCallback.CheckoutRequestID;
        const resultCode = stkCallback.ResultCode;

        // Fetch order to get user_id for push notification
        const { data: order } = await this.supabase
            .from('orders')
            .select('id, user_id')
            .eq('checkout_request_id', checkoutRequestId)
            .single();

        let pushToken = null;
        if (order?.user_id) {
            const { data: profile } = await this.supabase
                .from('profiles')
                .select('expo_push_token')
                .eq('id', order.user_id)
                .single();
            pushToken = profile?.expo_push_token;
        }

        // Update the order in Supabase based on the payment result
        if (resultCode === 0) {
            // Payment successful
            await this.supabase
                .from('orders')
                .update({ status: 'New' }) // Trigger your app's workflow by officially creating the new order
                .eq('checkout_request_id', checkoutRequestId);

            if (pushToken && order) {
                await this.sendPushNotification(pushToken, 'Payment Successful! 🎉', `Your order #${order.id} has been paid and is now being prepared.`);
            }
        } else {
            // Payment failed or cancelled
            this.logger.warn(`Payment failed for Request ID: ${checkoutRequestId} - ${stkCallback.ResultDesc}`);

            // Mark the order as Failed instead of deleting it so the user maintains a history
            if (order) {
                await this.supabase.from('orders').update({ status: 'Failed' }).eq('id', order.id);
            }

            if (pushToken && order) {
                await this.sendPushNotification(pushToken, 'Payment Failed', `Your payment for order #${order.id} was not completed: ${stkCallback.ResultDesc}`);
            }
        }
    }

    private async sendPushNotification(expoPushToken: string, title: string, body: string) {
        const message = { to: expoPushToken, sound: 'default', title, body };
        try {
            await firstValueFrom(
                this.httpService.post('https://exp.host/--/api/v2/push/send', message, {
                    headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
                })
            );
        } catch (error) {
            this.logger.error('Failed to send push notification', error);
        }
    }
}