import { Global, Module } from '@nestjs/common';
import { AuditoriaService } from './auditoria.service';

/**
 * Global porque todo módulo de domínio grava na trilha. É a única exceção à regra
 * do §6 de módulo não enxergar módulo — e é deliberada: auditoria é infraestrutura
 * transversal, não um domínio que os outros consomem.
 */
@Global()
@Module({
  providers: [AuditoriaService],
  exports: [AuditoriaService],
})
export class AuditoriaModule {}
