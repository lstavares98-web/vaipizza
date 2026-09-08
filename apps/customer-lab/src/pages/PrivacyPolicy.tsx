import { Link } from "react-router-dom";

export default function PrivacyPolicy() {
  return (
    <div className="page">
      <h1>Política de privacidade</h1>
      <section className="modifier-group" style={{ borderTop: "none", paddingTop: 0 }}>
        <p>
          A VaiPizza recolhe apenas os dados necessários para processar e entregar o seu pedido: nome, email,
          telefone, morada de entrega e localização aproximada (quando autoriza), e histórico de pedidos.
        </p>
      </section>
      <section className="modifier-group">
        <h3>Que dados guardamos</h3>
        <p>
          Nome, email e telefone da conta; moradas de entrega guardadas; localização usada para calcular distância e
          taxa de entrega; histórico e conteúdo dos pedidos, incluindo o método de pagamento escolhido (nunca os
          dados completos do cartão, que são processados diretamente pelo nosso parceiro de pagamentos).
        </p>
      </section>
      <section className="modifier-group">
        <h3>Para que usamos</h3>
        <p>
          Processar e entregar pedidos, calcular a taxa e o tempo de entrega, comunicar sobre o estado do pedido, e
          cumprir obrigações legais e fiscais.
        </p>
      </section>
      <section className="modifier-group">
        <h3>Partilha de dados</h3>
        <p>
          Partilhamos apenas o necessário com o estafeta responsável pela sua entrega (nome, morada, telefone) e com
          os processadores de pagamento (Stripe) para cobrança. Nunca vendemos os seus dados a terceiros.
        </p>
      </section>
      <section className="modifier-group">
        <h3>Os seus direitos</h3>
        <p>
          Pode aceder, corrigir ou pedir a eliminação dos seus dados a qualquer momento, através do seu perfil ou
          contactando-nos diretamente.
        </p>
      </section>
      <p style={{ padding: "0 1.1rem" }}>
        <Link to="/">← Voltar</Link>
      </p>
    </div>
  );
}
