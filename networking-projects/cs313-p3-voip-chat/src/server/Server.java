package server;

import java.io.*;
import java.net.*;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Map;
import shared.Message;
import server.serverUI.ServerController;

public class Server {

    static HashMap<String, ObjectOutputStream> onlineUsers = new HashMap<>();
    static volatile ServerController gui = new NoOpController();
    private static volatile ServerSocket serverSocket;

    /** Called by ServerApp on a background thread. Blocks until shutdown(). */
    public static void launch(int port, ServerController controller) {
        gui = controller;
        gui.log("Server starting on port " + port);
        try {
            serverSocket = new ServerSocket(port);
            gui.log("Listening on port " + port);
            while (!serverSocket.isClosed()) {
                try {
                    Socket clientSocket = serverSocket.accept();
                    new ClientHandler(clientSocket).start();
                } catch (IOException e) {
                    if (!serverSocket.isClosed())
                        gui.log("Accept error: " + e.getMessage());
                }
            }
        } catch (IOException e) {
            gui.log("Server error: " + e.getMessage());
        }
    }

    public static void shutdown() {
        try {
            if (serverSocket != null && !serverSocket.isClosed())
                serverSocket.close();
        } catch (IOException ignored) {}
    }

    /** Headless CLI fallback: java server.Server <port> */
    public static void main(String[] args) {
        if (args.length < 1) { System.err.println("Usage: java server.Server <port>"); System.exit(1); }
        launch(Integer.parseInt(args[0]), new NoOpController());
    }

    static void notifyUserListChanged() {
        gui.updateUserList(new ArrayList<>(onlineUsers.keySet()));
    }

    private static class NoOpController extends ServerController {
        @Override public void log(String m) { System.out.println(m); }
        @Override public void updateUserList(java.util.List<String> n) { System.out.println("Online: " + n); }
    }
}


class ClientHandler extends Thread {
    private Socket socket;
    private ObjectOutputStream out;
    private ObjectInputStream in;
    private String username;

    public ClientHandler(Socket socket) { this.socket = socket; }

    @Override
    public void run() {
        try {
            out = new ObjectOutputStream(socket.getOutputStream());
            in  = new ObjectInputStream(socket.getInputStream());

            while (true) {
                Message msg = (Message) in.readObject();
                if (msg.getType() == Message.Type.CONNECT) {
                    String name = msg.getSender();
                    synchronized (Server.onlineUsers) {
                        if (!Server.onlineUsers.containsKey(name)) {
                            username = name;
                            Server.onlineUsers.put(username, out);
                            broadcast(new Message(Message.Type.USER_LIST,
                                    new ArrayList<>(Server.onlineUsers.keySet())));
                            broadcast(new Message(Message.Type.CONNECT, username, ""));
                            Server.notifyUserListChanged();
                            break;
                        } else {
                            sendTo(out, new Message(Message.Type.ERROR, "Server:", "Username already taken."));
                        }
                    }
                }
            }

            Server.gui.log(username + " connected");

            while (true) {
                Message msg = (Message) in.readObject();
                Message.Type type = msg.getType();

                if (type == Message.Type.GLOBAL) {
                    Server.gui.log("[GLOBAL] " + username + ": " + msg.getText());
                    broadcastExclude(msg, username);

                } else if (type == Message.Type.WHISPER) {
                    Server.gui.log("[WHISPER] " + username + " → " + msg.getRecipient());
                    whisper(msg);

                } else if (type == Message.Type.CALL_REQUEST  ||
                           type == Message.Type.CALL_RESPONSE ||
                           type == Message.Type.CALL_TERMINATE) {
                    Server.gui.log("[CALL] " + type + " " + username + " → " + msg.getRecipient());
                    whisper(msg);

                } else if (type == Message.Type.VOICE_NOTE) {
                    if ("ALL".equals(msg.getRecipient())) {
                        Server.gui.log("[VOICE] " + username + " → everyone");
                        broadcastExclude(msg, username);
                    } else {
                        Server.gui.log("[VOICE] " + username + " → " + msg.getRecipient());
                        whisper(msg);
                    }

                } else if (type == Message.Type.CHANNEL_JOIN || type == Message.Type.CHANNEL_LEAVE) {
                    Server.gui.log("[CHANNEL] " + username
                            + (type == Message.Type.CHANNEL_JOIN ? " joined " : " left ")
                            + "#" + msg.getChannelName());

                } else if (type == Message.Type.DISCONNECT) {
                    break;
                }
            }

        } catch (IOException | ClassNotFoundException e) {
            Server.gui.log("Connection error (" + (username != null ? username : "?") + "): " + e.getMessage());
        } finally {
            close_procedure();
        }
    }

    private void sendTo(ObjectOutputStream target, Message msg) {
        try { target.writeObject(msg); target.flush(); target.reset(); }
        catch (IOException e) { e.printStackTrace(); }
    }

    private void broadcast(Message msg) {
        synchronized (Server.onlineUsers) {
            for (ObjectOutputStream o : Server.onlineUsers.values()) sendTo(o, msg);
        }
    }

    private void broadcastExclude(Message msg, String exclude) {
        synchronized (Server.onlineUsers) {
            for (Map.Entry<String, ObjectOutputStream> e : Server.onlineUsers.entrySet())
                if (!e.getKey().equals(exclude)) sendTo(e.getValue(), msg);
        }
    }

    private void whisper(Message msg) {
        synchronized (Server.onlineUsers) {
            ObjectOutputStream target = Server.onlineUsers.get(msg.getRecipient());
            if (target != null) sendTo(target, msg);
            else sendTo(out, new Message(Message.Type.ERROR, "Server:",
                    "User '" + msg.getRecipient() + "' is not online."));
        }
    }

    public void close_procedure() {
        try {
            if (username != null) {
                synchronized (Server.onlineUsers) {
                    Server.onlineUsers.remove(username);
                    broadcast(new Message(Message.Type.USER_LIST,
                            new ArrayList<>(Server.onlineUsers.keySet())));
                    broadcast(new Message(Message.Type.DISCONNECT, username, ""));
                    Server.notifyUserListChanged();
                }
                Server.gui.log(username + " disconnected");
            }
            if (socket != null) socket.close();
            if (in     != null) in.close();
            if (out    != null) out.close();
        } catch (Exception e) { e.printStackTrace(); }
    }
}