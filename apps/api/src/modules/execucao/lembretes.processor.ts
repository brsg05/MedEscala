import { InjectQueue, OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, type OnModuleInit } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { ExecucaoService } from './execucao.service';
import { FinanceiroService } from '../financeiro/financeiro.service';

export const FILA_DE_EXECUCAO = 'execucao';

/** A varredura é barata (dois índices) e o lembrete atrasa no máximo isto. */
const INTERVALO_DA_VARREDURA_MS = 60_000;

/**
 * Job recorrente dos lembretes da F16 (ADR-027): check-in liberado e plantão
 * terminado sem confirmação.
 *
 * Um agendador só (`upsertJobScheduler` com id fixo): subir a api de novo, ou
 * em duas instâncias, não duplica a varredura — e a varredura em si é
 * idempotente, porque cada lembrete marca a linha do plantão ao sair.
 */
@Processor(FILA_DE_EXECUCAO)
export class LembretesDeExecucaoProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(LembretesDeExecucaoProcessor.name);

  constructor(
    private readonly execucao: ExecucaoService,
    private readonly financeiro: FinanceiroService,
    @InjectQueue(FILA_DE_EXECUCAO) private readonly fila: Queue,
  ) {
    super();
  }

  onModuleInit(): void {
    this.fila.on('error', (erro) => {
      this.logger.warn(`Redis indisponível para os lembretes de execução: ${erro.message}`);
    });

    // Sem `await`: com o Redis fora, a api sobe mesmo assim (DEC-097).
    void this.fila
      .upsertJobScheduler(
        'lembretes-de-execucao',
        { every: INTERVALO_DA_VARREDURA_MS },
        { name: 'varrer-lembretes', opts: { removeOnComplete: true, removeOnFail: 50 } },
      )
      .catch((erro: unknown) => {
        this.logger.warn(`Agendador de lembretes não registrado: ${String(erro)}`);
      });
  }

  async process(): Promise<void> {
    await this.execucao.varrerLembretes();
    // F17 — prazo encerrado: emite a nota que faltou e libera (DEC-202).
    await this.financeiro.varrerLiberacoes();
  }

  @OnWorkerEvent('failed')
  aoFalhar(_job: unknown, erro: Error): void {
    this.logger.warn(`Varredura de lembretes falhou: ${erro.message}`);
  }

  @OnWorkerEvent('error')
  aoErroDeConexao(erro: Error): void {
    this.logger.warn(`Worker de lembretes sem Redis: ${erro.message}`);
  }
}
