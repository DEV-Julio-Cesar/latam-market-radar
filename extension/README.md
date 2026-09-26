# Modo navegador — versão experimental

## Instalação (Chrome ou Edge no computador)

1. Mantenha o backend do Radar rodando com `npm start`.
2. Abra `chrome://extensions` no Chrome ou `edge://extensions` no Edge.
3. Ative **Modo do desenvolvedor**, escolha **Carregar sem compactação** e selecione esta pasta `extension` (onde está `manifest.json`).
4. No Radar, abra **Conexão**, gere a chave e copie para o campo da extensão. A chave expira em sete dias; gerar outra revoga a anterior.
5. Cadastre pelo menos um monitoramento ativo **sem ID e sem refino**, com nome igual ao exibido no mercado e servidor Freya, Nidhogg ou Yggdrasil.
6. Clique **Iniciar** no painel da extensão. Uma aba dedicada do mercado será aberta. Não a use para outras páginas.
7. Confira na tela **Conexão** do Radar a última leitura e o estado. O histórico usa a fonte **Navegador (parcial)**.

O navegador interno do Codex não é o destino de instalação desta extensão. Use Chrome ou Edge. A extensão não foi instalada automaticamente.

## Funcionamento e limites

- Versão 1.2.0: cada item fica elegível novamente após cinco minutos desde o início de sua consulta. A fila é verificada a cada 30 segundos; somente uma consulta ocorre por vez. Há pelo menos 5 segundos entre navegações e um limite local de 30 navegações em 15 minutos (limite do Radar, não uma cota oficial). Muitos itens/páginas podem aumentar o intervalo. Chrome/Edge 120 ou superior.
- Leitura somente do DOM visível. Sem endpoints internos, interceptação, cópia de cookies, stealth, proxy ou tentativa de resolver desafios.
- Diante de desafio, bloqueio ou página não reconhecida, pausa. A retomada exige ação explícita; nunca tenta superar o bloqueio.
- A extensão consulta `storeType=SELL` (Transação: Venda), conforme os cartões de Vale Varmida mostrados pelo usuário. São preços anunciados por vendedores nessa página. O Radar compara esse preço às metas de compra/venda; não afirma ter medido negócios concluídos ou ordens de compradores.
- São lidas até cinco páginas, usando os botões públicos de paginação. O menor preço salvo é o menor entre as ofertas exatas **das páginas lidas**, não necessariamente o menor global. O registro informa quantas páginas foram lidas e se a cobertura ficou parcial. Variações do nome e equipamentos com refino não são incluídos.
- IDs e refinos não são inferidos. Monitoramentos que os exigem são ignorados, com contagem no painel da extensão.
- Preço igual ao da última leitura não gera nova amostra nem alerta repetido. A lista de ofertas é atualizada a cada leitura válida, incluindo preço, quantidade, vendedor e loja; a lista não é filtrada pela meta. Até 500 ofertas de até cinco páginas são guardadas. Consequentemente, as estatísticas representam mudanças observadas, não amostras regulares ponderadas pelo tempo.
- “Nenhum registro” não salva preço zero nem apaga o histórico.
- É necessário manter o computador, navegador e servidor local ativos. Suspensão do computador e limitação de abas em segundo plano podem atrasar as leituras. O processo pausa após reinício do navegador.
- O painel local atualiza os dados periodicamente. Canais externos continuam exigindo configuração no `.env`.
- Não é uma integração oficial da Gravity. O acesso em uma sessão normal não implica autorização do operador para coleta periódica.

## Estado da validação

A busca normal no navegador foi verificada com ofertas de Elunium no Freya. O parser foi testado com uma representação do texto exibido, e o pareamento, isolamento, importação, pausa lógica, deduplicação e revogação foram testados no backend. O build React passou. **O ciclo completo da extensão instalada ainda precisa ser validado no Chrome/Edge**; mudanças de HTML podem exigir ajustes no parser.

Não compartilhe a chave de conexão. Ela permite listar monitoramentos compatíveis e enviar preços para a sua conta local, mas não ler sua senha ou alterar usuários. Use “Revogar conexão” e “Pausar” para desligar.


### Correção 1.1.1

Leitor ajustado para rótulos com quebras de linha; filtro de ofertas alterado para Venda/SELL. Resultados com outros nomes agora geram ausência de oferta exata, sem tratar isso como erro de leitura. Teste de regressão com Vale Varmida a 28.000 z; 15 testes passaram. Ainda requer recarregar e validar a extensão instalada.

## Atualizar para 1.2.0

Pause a extensão, substitua seus arquivos pela pasta desta versão e clique em Recarregar na página de extensões. Mantenha a aba dedicada aberta e clique Iniciar. A próxima consulta carregará o novo leitor. A chave existente é preservada quando a mesma extensão é recarregada. A nova paginação ainda precisa de validação na extensão instalada; testes locais não substituem essa verificação.
