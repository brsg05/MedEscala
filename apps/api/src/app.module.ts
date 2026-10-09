import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { validarEnv, type Env } from './shared/config/env';
import { DominioExceptionFilter } from './shared/filters/dominio-exception.filter';
import { PrismaModule } from './shared/prisma/prisma.module';
import { SaudeController } from './shared/saude.controller';
import { AuditoriaModule } from './modules/auditoria/auditoria.module';
import { AuthModule } from './modules/auth/auth.module';
import { CredenciamentoModule } from './modules/credenciamento/credenciamento.module';
import { EscalaModule } from './modules/escala/escala.module';
import { OperadorModule } from './modules/operador/operador.module';
import { RepasseModule } from './modules/repasse/repasse.module';
import { CsrfGuard } from './modules/auth/guards/csrf.guard';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { PerfisGuard } from './modules/auth/guards/perfis.guard';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validarEnv }),
    // Redis só para jobs agendados (ADR-027). `maxRetriesPerRequest: null` é
    // exigência do BullMQ para as conexões dos workers.
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const url = new URL(config.get('REDIS_URL', { infer: true }));
        return {
          connection: {
            host: url.hostname,
            port: Number(url.port || 6379),
            maxRetriesPerRequest: null,
          },
        };
      },
    }),
    PrismaModule,
    AuditoriaModule,
    AuthModule,
    CredenciamentoModule,
    EscalaModule,
    RepasseModule,
    OperadorModule,
  ],
  controllers: [SaudeController],
  providers: [
    // A ORDEM IMPORTA. O Nest executa os guards globais na ordem de registro:
    //   1. CSRF   — mais barato, e precisa valer até em rota @Publico() de mutação;
    //   2. JWT    — resolve identidade e perfis, anexando à requisição;
    //   3. Perfis — depende do que o JWT anexou.
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PerfisGuard },

    { provide: APP_FILTER, useClass: DominioExceptionFilter },
  ],
})
export class AppModule {}
