import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import {
  FILA_DE_CONVITES,
  FilaDeConvitesService,
  type JobDeVencimento,
} from './fila-de-convites.service';

/**
 * Worker do BullMQ (ADR-027): quando o prazo de um convite vence, avança a fila
 * — do repasse ou da vaga (DEC-164).
 *
 * Roda no mesmo processo da api (DEC-100). Toda a regra está em `avancar`, que é
 * idempotente — se este job rodar duas vezes, ou depois de uma leitura já ter
 * avançado a fila, nada acontece de errado.
 */
@Processor(FILA_DE_CONVITES)
export class VencimentoDeConvitesProcessor extends WorkerHost {
  private readonly logger = new Logger(VencimentoDeConvitesProcessor.name);

  constructor(private readonly fila: FilaDeConvitesService) {
    super();
  }

  async process(job: Job<JobDeVencimento>): Promise<void> {
    // Fila de repasse ou de vaga (DEC-164).
    if (job.data.repasseId !== undefined) {
      await this.fila.avancar(job.data.repasseId);
    } else if (job.data.plantaoId !== undefined) {
      await this.fila.avancarVaga(job.data.plantaoId);
    }
  }

  @OnWorkerEvent('failed')
  aoFalhar(job: Job<JobDeVencimento> | undefined, erro: Error): void {
    // Não é perda de estado: a próxima leitura avança a fila (DEC-097).
    this.logger.warn(
      `Job de vencimento falhou (${job?.data.repasseId ?? job?.data.plantaoId ?? '?'}): ${erro.message}`,
    );
  }

  @OnWorkerEvent('error')
  aoErroDeConexao(erro: Error): void {
    this.logger.warn(`Worker sem Redis: ${erro.message}`);
  }
}
