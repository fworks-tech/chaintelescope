/**
 * @fileoverview Tarefa isolada de conversão e normalização de feeds JSON volumosos.
 * @module api/workers/tasks/parse-feed
 */

/**
 * Estrutura normalizada de um item de notícia.
 */
export interface FeedItem {
  /** Identificador único do item. */
  id: string;
  /** Título da publicação. */
  title: string;
  /** Link externo canônico. */
  url: string;
  /** Timestamp de publicação em formato ISO-8601. */
  publishedAt: string;
  /** Digest de integridade do conteúdo (opcional). */
  contentDigest?: string | undefined;
}

/**
 * Parâmetro de entrada contendo o JSON bruto em formato textual.
 */
export interface ParseFeedInput {
  rawJson: string;
}

/**
 * Saída estruturada contendo a contagem e os itens mapeados.
 */
export interface ParseFeedOutput {
  itemCount: number;
  items: FeedItem[];
}

/**
 * Executa a desserialização de JSON pesado e normalização de atributos dentro da Worker Thread.
 *
 * Processar `JSON.parse` em cargas de 20MB bloqueia a Call Stack principal do Node.js por mais de 100ms[cite: 1, 2].
 * Esta função isola essa operação na thread secundária.
 *
 * @param {ParseFeedInput} input - String JSON a ser desserializada.
 * @returns {ParseFeedOutput} Lista de itens prontos para persistência ou ingestão.
 */
export function parseFeedTask(input: ParseFeedInput): ParseFeedOutput {
  // Parsing síncrono isolado dentro da Worker Thread (não afeta o Event Loop principal)
  const parsed = JSON.parse(input.rawJson) as {
    items?: Array<{
      id?: string;
      title?: string;
      link?: string;
      pubDate?: string;
    }>;
  };

  const rawItems = Array.isArray(parsed?.items) ? parsed.items : [];

  const items: FeedItem[] = rawItems.map((item, index) => ({
    id: String(item.id ?? `item-${index}`),
    title: String(item.title ?? ""),
    url: String(item.link ?? ""),
    publishedAt: String(item.pubDate ?? new Date().toISOString()),
  }));

  return {
    itemCount: items.length,
    items,
  };
}
