# Streaming Scan Architecture: Backpressure & Lifecycle

## Pipeline Flow

[ Readable Source ] (fs.createReadStream / HTTP multipart body)
       │
       │ (Emits Buffer chunks <= highWaterMark, e.g. 64KB)
       ▼
[ ProgressTransform ] (Computes byte rate, throttles progress events to 250ms)
       │
       │ (Backpressure check: if downstream is full, paused via write() -> false)
       ▼
[   CountingSink   ] (crypto.createHash incremental update, zero buffer retention)

## Event Loop Phases & Non-Blocking Guarantees

1. Poll Phase:
   - O Node.js consome pacotes TCP ou leitura assíncrona de disco gerenciada pela libuv em fatias pequenas (chunks).
2. Backpressure:
   - Quando o CountingSink ou o hashing da CPU demora para processar, o buffer interno atinge o highWaterMark.
   - O write() subsequente retorna false, instruindo a fonte a pausar o envio até que o evento 'drain' seja emitido.
3. AbortSignal Propagation:
   - Se o cliente cancela a requisição HTTP (evento 'close' da conexão), o AbortSignal notifica o pipeline().
   - Todos os estágios intermediários invocam .destroy(err), liberando sockets e descritores de arquivos sem deixar nós zumbis no Event Loop.
