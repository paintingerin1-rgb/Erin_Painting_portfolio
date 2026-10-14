package client;

import java.io.*;
import java.net.*;
import javafx.application.Platform;
import shared.Message;

/**
 * Client class responsible for:
 * - Establishing a connection to the server
 * - Sending and receiving Message objects
 * - Updating the JavaFX UI through the ChatController
 */
public class client {
    private Socket socket;
    private ObjectOutputStream out;
    private ObjectInputStream in;
    private boolean isRunning = false;

    // Gives this class access to the chat window so incoming messages can be displayed
    private ChatController controller;

    public void setController(ChatController controller) {
        this.controller = controller;
    }

    /**
     * Connects to the server and starts listening for messages.
     * Returns true if connection succeeded, false if it failed.
     */
    public boolean connect(String host, int port, String username) {
    try {
        socket = new Socket();
        socket.connect(new InetSocketAddress(host, port));

        out = new ObjectOutputStream(socket.getOutputStream());
        in  = new ObjectInputStream(socket.getInputStream());

        // Tell the server who we are
        Message loginMsg = new Message(Message.Type.CONNECT, username, "Joining the chat...");
        out.writeObject(loginMsg);
        out.flush();

        // Wait for server's response before continuing
        Message response = (Message) in.readObject();

        if (response.getType() == Message.Type.ERROR) {
            // Username taken — close everything and return false
            in.close();
            out.close();
            socket.close();
            return false;
        }

        // Username accepted — start the listener thread normally
        isRunning = true;
        new Thread(this::listenToServer).start();

        // Handle the first message (USER_LIST) we already read
        handleIncomingData(response);

        return true;

    } catch (IOException | ClassNotFoundException e) {
        System.err.println("Error connecting to server: " + e.getMessage());
        isRunning = false;
        return false;
    }
}

    /**
     * Continuously reads messages from the server on a background thread.
     * Stops when the connection drops or disconnect() is called.
     */
    private void listenToServer() {
        try {
            while (isRunning) {
                Object data = in.readObject();
                if (data instanceof Message) {
                    handleIncomingData((Message) data);
                }
            }
        } catch (IOException | ClassNotFoundException e) {
            if (isRunning) {
                System.err.println("Connection to server lost: " + e.getMessage());
                disconnect();
            }
        }
    }

    /**
     * Routes incoming messages to the correct UI method.
     * All UI calls are wrapped in Platform.runLater() because this
     * runs on the background thread, not the JavaFX thread.
     */
    private void handleIncomingData(Message msg) {

        if (controller == null) {
            new Thread(() -> {
                while (controller == null) {
                    try { Thread.sleep(10);} catch (Exception e) {}
                }
                handleIncomingData(msg);
            }).start();
            return; // UI not ready yet
        }

        Message.Type type = msg.getType();

        if (type == Message.Type.GLOBAL) {
            Platform.runLater(() -> controller.appendToGlobal(
                msg.getSender() + ": " + msg.getText()
            ));

        } else if (type == Message.Type.USER_LIST) {
            Platform.runLater(() -> controller.updateUserList(msg.getOnlineUsers()));

        } else if (type == Message.Type.WHISPER) {
            Platform.runLater(() -> controller.receiveWhisper(
                msg.getSender(), msg.getText()
            ));

        } else if (type == Message.Type.CONNECT) {
            Platform.runLater(() -> controller.appendToGlobal(
                "*** " + msg.getSender() + " has joined ***"
            ));

        } else if (type == Message.Type.DISCONNECT) {
            Platform.runLater(() -> controller.appendToGlobal(
                "*** " + msg.getSender() + " has left ***"
            ));

        } else if (type == Message.Type.ERROR) {
            Platform.runLater(() -> controller.showError(msg.getText()));

        } else {
            System.out.println("Unhandled message type: " + type);
        }
    }

    /**
     * Sends a Message object to the server.
     * Synchronized to prevent two threads writing at the same time.
     */
    public synchronized void sendMessage(Message msg) {
        try {
            if (out != null) {
                out.writeObject(msg);
                out.flush();
                out.reset(); // Prevent memory leak from object cache
            }
        } catch (IOException e) {
            System.err.println("Failed to send message: " + e.getMessage());
        }
    }

    /**
     * Gracefully disconnects from the server and closes all resources.
     */
    public void disconnect() {
        isRunning = false;
        try {
            if (out != null) sendMessage(new Message(Message.Type.DISCONNECT, "Client", "Logging out"));
            if (in     != null) in.close();
            if (out    != null) out.close();
            if (socket != null) socket.close();
        } catch (IOException e) {
            System.err.println("Error during disconnect: " + e.getMessage());
        }
    }
}