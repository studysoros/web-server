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

async function newConn(socket: net.Socket): Promise<void> {
  console.log("new connection", socket.remoteAddress, socket.remotePort);
  try {
    await serveClient(socket);
  } catch (exc) {
    console.error("exception: ", exc);
  } finally {
    socket.destroy();
  }
}

async function serveClient(socket: net.Socket): Promise<void> {
  const conn: TCPConn = soInit(socket);
  while (true) {
    const data = await soRead(conn);
    if (data.length === 0) {
      console.log("end connection");
      break;
    }

    console.log("data", data);
    await soWrite(conn, data);
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

    conn.socket.pause();

    conn.reader!.resolve(data);
    conn.reader = null;
  });
  socket.on("end", () => {
    conn.ended = true;
    if (conn.reader) {
      conn.reader.resolve(Buffer.from(""));
      conn.reader = null;
    }
  });
  socket.on("error", (err: Error) => {
    conn.err = err;
    if (conn.reader) {
      conn.reader.reject(err);
      conn.reader = null;
    }
  });
  return conn;
}

function soRead(conn: TCPConn): Promise<Buffer> {
  console.assert(!conn.reader);
  return new Promise((resolve, reject) => {
    if (conn.err) {
      reject(conn.err);
      return;
    }
    if (conn.ended) {
      resolve(Buffer.from(""));
      return;
    }
    conn.reader = { resolve: resolve, reject: reject };
    conn.socket.resume();
  });
}

function soWrite(conn: TCPConn, data: Buffer): Promise<void> {
  console.assert(data.length > 0);
  return new Promise((resolve, reject) => {
    if (conn.err) {
      reject(conn.err);
      return;
    }

    conn.socket.write(data, (err?: Error) => {
      if (err) {
        reject(err);
      }
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
  const listener = soListen(server, HOST, PORT);
  while (true) {
    const socket = await soAccept(listener);
    newConn(socket);
  }
}

start();
