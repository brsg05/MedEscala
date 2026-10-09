import PDFDocument from 'pdfkit';
import {
  formatarCentavos,
  formatarDataHora,
  ROTULO_PAPEL_NO_TERMO,
  ROTULO_TIPO_TERMO,
  type PapelNoTermo,
} from '@medescala/contracts';
import type { ConteudoDoTermo } from './domain/conteudo';

export interface AssinaturaNoPdf {
  papel: PapelNoTermo;
  nome: string;
  registro: string | null;
  acao: string;
  assinadaEm: Date;
}

/**
 * Desenha o termo (F13, DEC-186). Só lê o retrato congelado (DEC-187): nada aqui
 * consulta o banco, então o texto do PDF é sempre o que foi aceito.
 *
 * Fonte Helvetica padrão do PDF: cobre os acentos do português (WinAnsi) e não
 * exige arquivo de fonte no servidor.
 */
export function renderizarTermo(dados: {
  conteudo: ConteudoDoTermo;
  hash: string;
  assinaturas: readonly AssinaturaNoPdf[];
  pendentes: readonly PapelNoTermo[];
  vigente: boolean;
}): Promise<Buffer> {
  const { conteudo: c } = dados;
  const titulo = ROTULO_TIPO_TERMO[c.tipo];

  const doc = new PDFDocument({
    size: 'A4',
    margin: 56,
    info: {
      Title: `${titulo} — MedEscala`,
      Author: 'MedEscala',
      // A data do documento é a da emissão, não a do download.
      CreationDate: new Date(c.emitidoEm),
    },
  });

  const partes: Buffer[] = [];
  doc.on('data', (b: Buffer) => partes.push(b));
  const pronto = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(partes)));
    doc.on('error', reject);
  });

  const cinza = '#555555';

  doc.font('Helvetica-Bold').fontSize(18).text(titulo);
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor(cinza)
    .text(`Emitido em ${formatarDataHora(c.emitidoEm)} · modelo v${String(c.versaoDoModelo)}`);
  if (!dados.vigente) {
    doc.fillColor('#b42318').text('Substituído por um repasse aprovado posteriormente.');
  }
  doc.fillColor('black').moveDown();

  doc.font('Helvetica-Bold').fontSize(11).text('Partes');
  doc.font('Helvetica').fontSize(10);
  for (const p of c.partes) {
    doc.text(`${ROTULO_PAPEL_NO_TERMO[p.papel]}: ${p.nome} — ${p.registro}`);
  }
  doc.moveDown();

  doc.font('Helvetica-Bold').fontSize(11).text('Plantão');
  doc
    .font('Helvetica')
    .fontSize(10)
    .text(`${c.plantao.setor} · ${c.plantao.unidade} · ${c.plantao.instituicao}`)
    .text(`${formatarDataHora(c.plantao.inicio)} a ${formatarDataHora(c.plantao.fim)}`)
    .text(
      `${c.plantao.especialidade} · ${c.plantao.modeloContratacao} · ${formatarCentavos(c.plantao.valorCentavos)}`,
    );
  doc.moveDown();

  doc.font('Helvetica-Bold').fontSize(11).text('Cláusulas');
  doc.font('Helvetica').fontSize(10);
  c.clausulas.forEach((texto, i) => {
    doc.text(`${String(i + 1)}. ${texto}`, { align: 'justify' }).moveDown(0.4);
  });
  doc.moveDown();

  doc.font('Helvetica-Bold').fontSize(11).text('Assinaturas');
  doc.font('Helvetica').fontSize(10);
  for (const a of dados.assinaturas) {
    doc.text(
      `${ROTULO_PAPEL_NO_TERMO[a.papel]}: ${a.nome}${a.registro === null ? '' : ` (${a.registro})`}`,
    );
    doc
      .fillColor(cinza)
      .fontSize(9)
      .text(`${a.acao} em ${formatarDataHora(a.assinadaEm)} · aceite no app`)
      .fillColor('black')
      .fontSize(10)
      .moveDown(0.3);
  }
  for (const papel of dados.pendentes) {
    doc.fillColor('#b54708').text(`${ROTULO_PAPEL_NO_TERMO[papel]}: aguardando aceite`);
  }
  doc.fillColor('black').moveDown();

  doc
    .fontSize(8)
    .fillColor(cinza)
    .text(`SHA-256 do conteúdo: ${dados.hash}`)
    .text(
      'Assinatura simulada (DEC-185): cada parte aceitou por uma ação registrada no MedEscala. ' +
        'O hash acima identifica o conteúdo aceito; qualquer alteração no texto produziria outro.',
    );

  doc.end();
  return pronto;
}
