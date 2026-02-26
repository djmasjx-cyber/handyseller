import { AppService } from './app.service';
export declare class AppController {
    private readonly appService;
    constructor(appService: AppService);
    getHealth(): {
        status: string;
        service: string;
        timestamp: string;
    };
    getHealthReady(): Promise<{
        status: string;
        service: string;
        timestamp: string;
        checks: {
            database: string;
        };
    }>;
}
