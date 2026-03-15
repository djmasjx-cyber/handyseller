import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

interface GptMessage {
  role: 'system' | 'user' | 'assistant';
  text: string;
}

interface CompletionResponse {
  result: {
    alternatives: Array<{
      message: { role: string; text: string };
      status: string;
    }>;
    usage: { inputTextTokens: string; completionTokens: string; totalTokens: string };
    modelVersion: string;
  };
}

@Injectable()
export class YandexGptService {
  private readonly logger = new Logger(YandexGptService.name);
  private readonly apiUrl = 'https://llm.api.cloud.yandex.net/foundationModels/v1/completion';

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {}

  private get apiKey(): string {
    return this.configService.getOrThrow<string>('YANDEX_GPT_API_KEY');
  }

  private get folderId(): string {
    return this.configService.getOrThrow<string>('YANDEX_GPT_FOLDER_ID');
  }

  private get modelUri(): string {
    return `gpt://${this.folderId}/yandexgpt/latest`;
  }

  async completion(messages: GptMessage[], temperature = 0.3, maxTokens = 2000): Promise<{ text: string; tokensUsed: number }> {
    const body = {
      modelUri: this.modelUri,
      completionOptions: {
        stream: false,
        temperature,
        maxTokens: String(maxTokens),
      },
      messages,
    };

    try {
      const { data } = await firstValueFrom(
        this.httpService.post<CompletionResponse>(this.apiUrl, body, {
          headers: {
            Authorization: `Api-Key ${this.apiKey}`,
            'Content-Type': 'application/json',
            'x-folder-id': this.folderId,
          },
        }),
      );

      const alt = data.result.alternatives[0];
      const tokensUsed = parseInt(data.result.usage.totalTokens, 10) || 0;

      return { text: alt.message.text, tokensUsed };
    } catch (err) {
      const axErr = err as { response?: { status?: number; data?: unknown }; message?: string };
      this.logger.error(
        `YandexGPT error: ${axErr.response?.status ?? 'unknown'} — ${JSON.stringify(axErr.response?.data ?? axErr.message)}`,
      );
      throw err;
    }
  }
}
