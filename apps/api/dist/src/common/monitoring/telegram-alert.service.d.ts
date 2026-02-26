export declare class TelegramAlertService {
    private readonly botToken;
    private readonly chatId;
    constructor();
    sendAlert(message: string, context?: Record<string, unknown>): Promise<void>;
}
