package server;

import java.io.*;
import java.net.*;
import java.util.ArrayList;
import java.util.HashMap;
import shared.Message;

/**
 * Server --- handles all networking responsibilities in the client-server messaging application
 */
public class Server {

    // Maps usernames to their output streams
    static HashMap<String, ObjectOutputStream> onlineUsers = new HashMap<>();

    /**
     * Main entry point for the server
     * @param args command line arguments (expects port number as args[0])
     */
    public static void main(String[] args) {

        int portNumber = Integer.parseInt(args[0]);
        // Could add argument validation or conversion error handling for better practice

        try (ServerSocket serverSocket = new ServerSocket(portNumber)) {

            System.out.println("Server is online . . .");

            while (true) {
                Socket clientSocket = serverSocket.accept();
                System.out.println("Client has connected");

                ClientHandler handler = new ClientHandler(clientSocket);
                handler.start();
            }

        } catch (IOException e) {
            System.err.println("Server ERROR: " + e.getMessage());
            // On exit, just close the socket and input/output streams
        }
    }
}

/**
 * ClientHandler --- handles communication with a single client
 */
class ClientHandler extends Thread {
    private Socket socket;
    private ObjectOutputStream out;
    private ObjectInputStream in;
    private String username;

    public ClientHandler(Socket socket) {
        this.socket = socket;
    }

    /**
     * Overrides Thread's run method to handle client communication
     */
    @Override
    public void run() {
        try {
            // Set up I/O streams
            out = new ObjectOutputStream(socket.getOutputStream());
            in = new ObjectInputStream(socket.getInputStream());

            // Handle username acquisition and verification
            while (true) {
                Message inputMsg = (Message) in.readObject();

                if (inputMsg.getType() == Message.Type.CONNECT) {
                    String requestedName = inputMsg.getSender();

                    synchronized (Server.onlineUsers) {
                        if (!Server.onlineUsers.containsKey(requestedName)) {
                            username = requestedName;
                            Server.onlineUsers.put(username, out);
                            broadcast(new Message(Message.Type.USER_LIST, new ArrayList<>(Server.onlineUsers.keySet())));
                            broadcast(new Message(Message.Type.CONNECT,username,""));
                            break;

                        } else {
                            // Username already taken
                            out.writeObject(new Message(Message.Type.ERROR,
                                    "Server:", "Username already Taken."));
                        }
                    }
                }
            }

            System.out.println(username + " has connected");

            // Main loop to handle incoming messages
            while (true) {
                Message chatMsg = (Message) in.readObject();
                System.err.println(username + ": " + chatMsg.getText());

                if (chatMsg.getType() == Message.Type.GLOBAL) {
                    broadcast(chatMsg);
                } else if (chatMsg.getType() == Message.Type.WHISPER) {
                    whisper(chatMsg);
                } else if (chatMsg.getType() == Message.Type.DISCONNECT) {
                    break;
                }
            }

        } catch (IOException | ClassNotFoundException e) {
            System.err.println("Connection error with '" + username + "'");
        } finally {
            close_procedure();
        }
    }

    /**
     * Closes the client connection and updates user list
     */
    public void close_procedure() {
        try {
            if (username != null) {
                synchronized (Server.onlineUsers) {
                    Server.onlineUsers.remove(username);
                    broadcast(new Message(Message.Type.USER_LIST, new ArrayList<>(Server.onlineUsers.keySet())));
                    broadcast(new Message(Message.Type.DISCONNECT,username,""));
                }
                System.out.println(username + " has disconnected");
            }
            if (socket != null) socket.close();
            if (in != null) in.close();
            if (out != null) out.close();

        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    /**
     * Broadcasts a message to all connected clients
     */
    private void broadcast(Message msg) {
        synchronized (Server.onlineUsers) {
            for (ObjectOutputStream clientOut : Server.onlineUsers.values()) {
                try {
                    clientOut.writeObject(msg);
                    clientOut.flush();
                } catch (IOException e) {
                    e.printStackTrace();
                }
            }
        }
    }

    /**
     * Sends a private message to a specific client
     */
    private void whisper(Message msg) {
        String targetUser = msg.getRecipient();

        synchronized (Server.onlineUsers) {
            ObjectOutputStream targetOut = Server.onlineUsers.get(targetUser);
            if (targetOut != null) {
                try {
                    targetOut.writeObject(msg);
                    targetOut.flush();
                } catch (IOException e) {
                    e.printStackTrace();
                }
            }
        }
    }
}