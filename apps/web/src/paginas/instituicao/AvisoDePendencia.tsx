/**
 * DEC-063 — a instituição nasce pendente com o cadastro aberto.
 *
 * O aviso diz o que JÁ dá para fazer, não só o que está bloqueado: a estrutura
 * pode ser montada enquanto o CNPJ é conferido (DEC-066).
 */
export function AvisoDePendencia(): React.JSX.Element {
  return (
    <div className="rounded-xl border border-espera/30 bg-espera-fundo px-4 py-3 text-sm leading-relaxed text-espera">
      <p className="font-semibold">CNPJ em conferência</p>
      <p className="mt-1">
        Até a plataforma confirmar o CNPJ, a instituição não publica vagas nem vê médicos. Enquanto
        isso, você já pode cadastrar unidades, setores e chefias em Estrutura.
      </p>
    </div>
  );
}
