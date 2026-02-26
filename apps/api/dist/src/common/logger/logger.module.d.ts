import { MiddlewareConsumer, NestModule } from '@nestjs/common';
export declare class LoggerModule implements NestModule {
    configure(consumer: MiddlewareConsumer): void;
}
