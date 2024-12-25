import * as net from "net";

const HOST = "127.0.0.1";
const PORT = "1234";

type TCPConn = {
  socket: net.Socket;
  err: null | Error;
  ended: boolean;
  reader: null | {
    resolve: (value: Buffer) => void;
    reject: (reason: Error) => void;
  };
};

type TCPListener = {
  server: net.Server;
  err: null | Error;
  reader: null | {
    resolve: (value: net.Socket) => void;
    reject: (reason: Error) => void;
  };
};

type DynBuf = {
  data: Buffer; // use .data.length method to find Buffer length
  length: number; // actual data length
};

function bufPush(buf: DynBuf, newData: Buffer): void {
  const newLen = buf.length + newData.length;
  if (buf.data.length < newLen) {
    let cap = Math.max(buf.data.length, 32);
    while (cap < newLen) {
      cap *= 2;
    }
    const newBuffer = Buffer.alloc(cap);
    buf.data.copy(newBuffer, 0, 0);
    buf.data = newBuffer;
  }
  newData.copy(buf.data, buf.length, 0);
  buf.length = newLen;
}

function cutMessage(buf: DynBuf): null | Buffer {
  const idx = buf.data.subarray(0, buf.length).indexOf("\n");

  if (idx < 0) return null;

  const frontMsg = Buffer.from(buf.data.subarray(0, idx + 1));
  bufPop(buf, idx + 1);
  return frontMsg;
}

function bufPop(buf: DynBuf, len: number): void {
  buf.data.copyWithin(0, len, buf.length);
  buf.length -= len;
}

async function newConn(socket: net.Socket) {
  console.log("new connection", socket.remoteAddress, socket.remotePort);
  try {
    await serveClient(socket);
  } catch (error) {
    console.error("Error during connection handling: ", error);
  } finally {
    socket.destroy();
  }
}

async function serveClient(socket: net.Socket) {
  const conn: TCPConn = soInit(socket);
  const buf: DynBuf = { data: Buffer.alloc(0), length: 0 };
  await soWrite(conn, Buffer.from("type something...\n"));

  while (true) {
    const msg: null | Buffer = cutMessage(buf);

    if (!msg) {
      const data: Buffer = await soRead(conn);
      bufPush(buf, data);

      if (data.length === 0) {
        console.log("end connection");
        return;
      }

      continue;
    }

    if (msg.equals(Buffer.from("quit\n"))) {
      await soWrite(conn, Buffer.from("Bye.\n"));
      socket.destroy();
      return;
    } else {
      const reply = Buffer.concat([Buffer.from("Echo: "), msg]);
      console.log(reply);
      await soWrite(conn, reply);
    }
  }
}

function soInit(socket: net.Socket): TCPConn {
  const conn: TCPConn = {
    socket: socket,
    err: null,
    ended: false,
    reader: null,
  };
  socket.on("data", (data: Buffer) => {
    console.assert(conn.reader);
    // if (!conn.reader) {
    //   throw new Error("Unexpected state: conn.reader is null");
    // }
    conn.socket.pause();
    conn.reader!.resolve(data);
    conn.reader = null;
  });
  socket.on("end", () => {
    conn.ended = true;
    if (conn.ended) {
      conn.reader.resolve(Buffer.from(""));
      conn.reader = null;
    }
  });
  socket.on("error", (e: Error) => {
    conn.err = e;
    if (conn.err) {
      conn.reader.reject(e);
      conn.reader = null;
    }
  });
  return conn;
}

function soRead(conn: TCPConn): Promise<Buffer> {
  console.assert(!conn.reader);
  // if (conn.reader) {
  //   throw new Error("Reader already exists");
  // }
  return new Promise((resolve, reject) => {
    if (conn.err) {
      reject(conn.err);
      return;
    }

    if (conn.ended) {
      resolve(Buffer.from(""));
      return;
    }

    conn.reader = { resolve, reject };
    conn.socket.resume();
  });
}

function soWrite(conn: TCPConn, data: Buffer): Promise<void> {
  console.assert(data.length > 0);
  // if (data.length < 0) {
  //   throw new Error("Cannot write empty data");
  // }
  return new Promise((resolve, reject) => {
    if (conn.err) {
      reject(conn.err);
      return;
    }

    conn.socket.write(data, (e?: Error) => {
      if (e) reject(e);
      resolve();
    });
  });
}

function soListen(server: net.Server, host: string, port: string): TCPListener {
  const listener: TCPListener = {
    server: server,
    err: null,
    reader: null,
  };
  server.on("connection", (socket: net.Socket) => {
    console.assert(listener.reader);
    listener.reader.resolve(socket);
    listener.reader = null;
  });
  server.on("error", (e: Error) => {
    listener.err = e;
    if (listener.err) {
      listener.reader.reject(e);
      listener.reader = null;
    }
  });

  listener.server.listen({ host, port });

  return listener;
}

function soAccept(listener: TCPListener): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    listener.reader = { resolve, reject };
  });
}

async function start() {
  const server = net.createServer({ pauseOnConnect: true });
  console.log("server started...");

  const listener = soListen(server, HOST, PORT);
  while (true) {
    const socket = await soAccept(listener);
    newConn(socket);
  }
}

start();
