package client;

import java.io.*;
import java.net.*;
import javafx.application.Platform;
import shared.Message;
import client.ui.MainController;

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
    private MainController controller;

    public P2PTransferEngine p2pEngine;

    private File sharedDirectory = new File("./shared");
    public java.util.Map<String, java.security.PublicKey> searchResultKeys = new java.util.HashMap<>();

    public void setSharedDirectory(File dir) {
        this.sharedDirectory = dir;
        if (p2pEngine != null) {
            p2pEngine.setSharedDirectory(dir);
        }
    }

    public java.util.Map<String, String> searchResultOwners = new java.util.HashMap<>();

    public void setController(MainController controller) {
        this.controller = controller;
        if (p2pEngine != null) p2pEngine.setController(controller); 
    }

    /**
     * Connects to the server, initializes the P2P Engine, and starts listening for messages.
     * Returns true if connection succeeded, false if it failed.
     */
    public boolean connect(String host, int port, String username) {
        try {
            p2pEngine = new P2PTransferEngine();
            p2pEngine.startP2PListener();

            // connect to the server
            socket = new Socket();
            //socket.connect(new InetSocketAddress(host, port));
            //add 3 second timeout
            socket.connect(new InetSocketAddress(host, port), 3000);

            out = new ObjectOutputStream(socket.getOutputStream());
            in  = new ObjectInputStream(socket.getInputStream());

            Message loginMsg = new Message(Message.Type.CONNECT, username, "Joining the network...");
            
            // Convert Base64 string from engine back to PublicKey object
            java.security.PublicKey myKey = security.KeyHandler.stringToPublicKey(p2pEngine.getPublicKeyBase64());
            loginMsg.setpublicKey(myKey);

            out.writeObject(loginMsg);
            out.flush();

            Message response = (Message) in.readObject();

            if (response.getType() == Message.Type.ERROR) {
                // Username taken — close everything and return false
                in.close();
                out.close();
                socket.close();
                return false;
            }

            // start listening for incoming data
            isRunning = true;
            new Thread(this::listenToServer).start();

            // Handle the first message we already read
            handleIncomingData(response);

            return true;

        } catch (Exception e) {
            System.err.println("Error connecting to server or initializing P2P: " + e.getMessage());
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
                System.err.println("Connection to server lost.");
                isRunning = false;
                
                // If we are logged in, show the popup. Otherwise, just exit.
                if (controller != null) {
                    controller.showServerDisconnectAlert();
                } else {
                    disconnect();
                    System.exit(0);
                }
            }
        }
    }

    /**
     * Routes incoming messages to the correct UI method or P2P logic.
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

        if (type == Message.Type.SEARCH_RESULT) {
            // the server found files. Save the names and the owner's public keys.
            if (msg.getResultsServer() != null) {
                java.util.List<String> fileNames = new java.util.ArrayList<>();
                for (Message.SearchResultEntry entry : msg.getResultsServer()) {
                    fileNames.add(entry.fileName);
                    // store the key so we can encrypt our download request later
                    searchResultKeys.put(entry.fileName, entry.ownerKey); 
                    searchResultOwners.put(entry.fileName, entry.ownerUsername);
                }
                Platform.runLater(() -> controller.onSearchResults(fileNames));
            }

        } else if (type == Message.Type.SEARCH_REQUEST) {
            // Someone is searching. Check local folder using the P2P engine.
            if (sharedDirectory != null && sharedDirectory.exists()) {
                java.util.List<String> foundPaths = p2pEngine.searchForFile(sharedDirectory, msg.getText());
                
                if (!foundPaths.isEmpty()) {
                    // files found, send a response back to the server.
                    java.util.List<String> results = new java.util.ArrayList<>();
                    for (String path : foundPaths) {
                        results.add(new File(path).getName());
                    }
                    Message replyMsg = new Message(results, "Client");
                    replyMsg.setSearchID(msg.getSearchID());
                    sendMessage(replyMsg);
                }
            }

        } else if (type == Message.Type.DOWNLOAD_REQUEST) {
            String fileName = msg.getText();
            String downloaderIP = msg.getRequesterIP();
            
            // extract the downloader's Public Key from the transport container
            String downloaderPubKeyBase64 = msg.getEncryptedMessage().encryptedData; 
            
            String decryptedMessageKey = "";
            try {
                decryptedMessageKey = p2pEngine.getCrypto().decryptMessageKey(msg.getEncryptedMessage().encryptedKey);
            } catch (Exception e) {
                System.err.println("Failed to decrypt incoming message key");
            }
            
            File fileToSend = new File(sharedDirectory, fileName);
            if (fileToSend.exists()) {
                int targetPort = msg.getP2pPort();
                if (fileToSend.exists()) {
                    p2pEngine.connectAndSendFile(downloaderIP, targetPort, downloaderPubKeyBase64, fileToSend, decryptedMessageKey);
                }
            }

        } else if (type == Message.Type.ERROR) {
            System.err.println("Server Error: " + msg.getText());

        } else if (type == Message.Type.CONNECT) {
            System.out.println("Server status: " + msg.getText());

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
        if (p2pEngine != null) {
            p2pEngine.stopListener();
        }
        isRunning = false;
        try {
            if (out != null) {
                sendMessage(new Message(Message.Type.DISCONNECT, "Client", "Logging out"));
            }
            if (in     != null) {
                in.close();
            }
            if (out    != null) {
                out.close();
            }
            if (socket != null) {
                socket.close();
            }
        } catch (IOException e) {
            System.err.println("Error during disconnect: " + e.getMessage());
        }
    }

    /**
     * Called by the UI to ask the server to search the network for a file.
     */
    public void sendSearchRequest(String query) {
        Message searchMsg = new Message(Message.Type.SEARCH_REQUEST, "Client", query);
        sendMessage(searchMsg);
        System.out.println("Searching network for: " + query);
    }

    /**
     * Called by the UI when the user clicks 'Download' on a search result.
     */
    public void requestDownload(String fileName) {
        String targetOwner = searchResultOwners.get(fileName); 
        java.security.PublicKey targetKey = searchResultKeys.get(fileName); 

        Message reqMsg = new Message(Message.Type.DOWNLOAD_REQUEST, "Client", fileName);
        reqMsg.setRecipient(targetOwner); 
        
        String messageKey = java.util.UUID.randomUUID().toString();
        p2pEngine.setExpectedMessageKey(messageKey); // Store locally to verify later
        
        try {
            String encryptedKey = p2pEngine.getCrypto().encryptMessageKey(messageKey, targetKey);
            security.EncryptedMessage transport = new security.EncryptedMessage(encryptedKey, p2pEngine.getPublicKeyBase64(), null);
            reqMsg.setEncryptedMessage(transport);
        } catch (Exception e) {
            e.printStackTrace();
        }
        
        reqMsg.setP2pPort(p2pEngine.getP2PPort());
        sendMessage(reqMsg);
        System.out.println("Requested download for: " + fileName);
    }
}