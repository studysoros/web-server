# Getting Started

start server command: `npx tsx src/filename.ts`

start client command (use netcat): `nc 127.0.0.1 1234`

# Filenames

**tcp_echo.ts** is a basic implementation of an echo server

**tcp_echo_promise.ts** is a promise version of tcp_echo.ts except the "accept" primitive

**tcp_echo_promise2.ts** is a promise version of tcp_echo.ts with the "accept" primitive

**msg_echo.ts** is an implementation of a simpler protocol to illustrate the most important function of a (tcp) protocol: splitting byte stream into messages
