import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MpesaModule } from './mpesa/mpesa.module';

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
        }),
        MpesaModule,
    ],
})
export class AppModule { }