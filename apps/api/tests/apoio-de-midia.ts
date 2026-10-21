/**
 * Arquivos de prova do card #46, montados byte a byte: o bastante para a
 * conferência pelos bytes reconhecer o formato, a duração e o quadro — sem
 * depender de ffmpeg nem de arquivo binário no repositório.
 */

import { deflateSync } from "node:zlib";

function caixa(tipo: string, conteudo: Buffer): Buffer {
  const cabecalho = Buffer.alloc(8);
  cabecalho.writeUInt32BE(8 + conteudo.length, 0);
  cabecalho.write(tipo, 4, "latin1");
  return Buffer.concat([cabecalho, conteudo]);
}

/** Um mp4 (ISO BMFF) com `mvhd` e `tkhd`: duração e quadro legíveis. */
export function mp4DeProva(
  duracaoMs: number,
  opcoes: { largura?: number; altura?: number; marca?: string; recheio?: number } = {},
): Buffer {
  const marca = opcoes.marca ?? "isom";
  const ftyp = caixa(
    "ftyp",
    Buffer.concat([
      Buffer.from(marca, "latin1"),
      Buffer.from([0, 0, 2, 0]),
      Buffer.from(marca === "qt  " ? "qt  " : "isomiso2avc1mp41", "latin1"),
    ]),
  );
  const mvhd = Buffer.alloc(4 + 16 + 80);
  mvhd.writeUInt32BE(1000, 12);
  mvhd.writeUInt32BE(duracaoMs, 16);
  const tkhd = Buffer.alloc(84);
  tkhd.writeUInt32BE((opcoes.largura ?? 1080) * 65536, 76);
  tkhd.writeUInt32BE((opcoes.altura ?? 1920) * 65536, 80);
  const moov = caixa(
    "moov",
    Buffer.concat([caixa("mvhd", mvhd), caixa("trak", caixa("tkhd", tkhd))]),
  );
  return Buffer.concat([
    ftyp,
    moov,
    caixa("mdat", Buffer.alloc(opcoes.recheio ?? 256, 7)),
  ]);
}

/** EBML: identificador já com o marcador, tamanho em 1 byte. */
function elemento(id: number[], conteudo: Buffer): Buffer {
  return Buffer.concat([Buffer.from(id), Buffer.from([0x80 | conteudo.length]), conteudo]);
}

/**
 * Um webm. Com `duracaoMs`, leva `Info/Duration` (float de 8 bytes, escala
 * padrão de 1 ms) e o quadro; sem, é como o MediaRecorder grava: segmento de
 * tamanho desconhecido, sem duração.
 */
export function webmDeProva(duracaoMs?: number): Buffer {
  const cabecalho = elemento(
    [0x1a, 0x45, 0xdf, 0xa3],
    Buffer.concat([
      elemento([0x42, 0x82], Buffer.from("webm", "latin1")),
      elemento([0x42, 0x87], Buffer.from([4])),
    ]),
  );
  const desconhecido = Buffer.from([0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);
  const partes: Buffer[] = [];
  if (duracaoMs !== undefined) {
    const duracao = Buffer.alloc(8);
    duracao.writeDoubleBE(duracaoMs, 0);
    partes.push(elemento([0x15, 0x49, 0xa9, 0x66], elemento([0x44, 0x89], duracao)));
    const largura = Buffer.alloc(2);
    largura.writeUInt16BE(720, 0);
    const altura = Buffer.alloc(2);
    altura.writeUInt16BE(1280, 0);
    partes.push(
      elemento(
        [0x16, 0x54, 0xae, 0x6b],
        elemento(
          [0xae],
          elemento([0xe0], Buffer.concat([elemento([0xb0], largura), elemento([0xba], altura)])),
        ),
      ),
    );
  }
  return Buffer.concat([
    cabecalho,
    Buffer.from([0x18, 0x53, 0x80, 0x67]),
    desconhecido,
    ...partes,
    Buffer.from([0x1f, 0x43, 0xb6, 0x75]),
    desconhecido,
    Buffer.alloc(128, 1),
  ]);
}

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Um png de 1×1 de verdade. */
export function pngDeProva(): Buffer {
  const pedaco = (tipo: string, dados: Buffer) => {
    const tamanho = Buffer.alloc(4);
    tamanho.writeUInt32BE(dados.length, 0);
    const corpo = Buffer.concat([Buffer.from(tipo, "latin1"), dados]);
    const verificacao = Buffer.alloc(4);
    verificacao.writeUInt32BE(crc32(corpo), 0);
    return Buffer.concat([tamanho, corpo, verificacao]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pedaco("IHDR", ihdr),
    pedaco("IDAT", deflateSync(Buffer.from([0, 255, 0, 0]))),
    pedaco("IEND", Buffer.alloc(0)),
  ]);
}
