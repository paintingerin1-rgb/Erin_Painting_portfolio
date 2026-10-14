package server;

import java.io.*;
import java.net.*;
import java.security.PublicKey;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import server.Server.ClientRecord;
import shared.Message;

/**
 * Server --- handles client requests for client-server communication
 * in a peer-to-peer file sending application
 * Note: code modified from Project 1
 * @author Ryan Allen & Kayla de Beer
 */
public class Server {

    // Maps usernames to their output streams and public keys
    static ConcurrentHashMap<String, ClientRecord> onlineUsers = new ConcurrentHashMap<>();

    // Maps Search UUID -> SearchSession object
    public static ConcurrentHashMap<UUID, SearchSession> activeSearches = new ConcurrentHashMap<>();
    public static final ScheduledExecutorService scheduler = Executors.newScheduledThreadPool(4);

    /**
     * Main entry point for the server
     * @param args command line arguments (expects port number as args[0])
     */
    public static void main(String[] args) {

        int portNumber = Integer.parseInt(args[0]);

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
        }
    }

    /**
     * A helper class to store client-specific info
     */
    static class ClientRecord {
        ObjectOutputStream out;
        PublicKey publicKey;
        ClientRecord(ObjectOutputStream out, PublicKey publicKey) {
            this.out = out;
            this.publicKey = publicKey;
        }
    }

    /**
     * A helper class to aggregate search results for a specific request
     */
    static class SearchSession {
        String requester;
        List<Message.SearchResultEntry> results = Collections.synchronizedList(new ArrayList<>());
        SearchSession(String requester) { this.requester = requester; }
    }
}

/**
 * ClientHandler --- handles communication with a single client
 * Note: code modified from Project 1
 * @author Ryan Allen & Kayla de Beer
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
                    PublicKey key = inputMsg.getPublicKey();

                    if (!Server.onlineUsers.containsKey(requestedName)) {
                        username = requestedName;
                        Server.onlineUsers.put(username, new Server.ClientRecord(out, key));
                        
                        // Tell the client the login was successful so it stops waiting!
                        out.writeObject(new Message(Message.Type.CONNECT, "Server", "Login successful"));
                        out.flush();
                        
                        break;
                    } else {
                        // Username already taken
                        out.writeObject(new Message(Message.Type.ERROR, "Server:", "Username already Taken."));
                    }
                }
            }

            System.out.println(username + " has connected");

            // Main loop to handle incoming messages
            while (true) {
                Message msg = (Message) in.readObject();

                switch (msg.getType()) {
                    case SEARCH_REQUEST:
                        handleSearch(msg);
                        break;
                    case SEARCH_RESULT:
                        handleResults(msg);
                        break;
                    case DOWNLOAD_REQUEST:
                        handleIntroduction(msg);
                        break;
                    case DISCONNECT:
                        return;
                }
            }

        } catch (IOException | ClassNotFoundException e) {
            System.err.println("Connection error with '" + username + "'");
        } finally {
            close_procedure();
        }
    }

    /**
     * Upon receipt of a search request from a client:
     * Creates new search session so that results can be collected and linked to the correct searcher
     * Forwards the search string to all other clients with a unique search ID (for tracking purposes)
     * Schedules a message to send search results back to original client
     */
    private void handleSearch(Message msg) {
        UUID searchID = UUID.randomUUID();

        // 1. Create the session
        Server.SearchSession session = new Server.SearchSession(username);
        Server.activeSearches.put(searchID, session);

        // 2. Broadcast the search anonymously with the ID to others
        Message searchBroadcast = new Message(Message.Type.SEARCH_REQUEST, "Server", msg.getText());
        searchBroadcast.setSearchID(searchID);
        broadcastExclude(searchBroadcast, username);

        // 3. Schedule the 1 second timeout (so that server knows when to send aggregate search results)
        Server.scheduler.schedule(() -> {
            Server.SearchSession finishedSession = Server.activeSearches.remove(searchID);
            if (finishedSession != null) {
                // Send the aggregated list back to the original requester
                Message finalResults = new Message(finishedSession.results);
                finalResults.setRecipient(finishedSession.requester);
                whisper(finalResults);
            }
        }, 1, TimeUnit.SECONDS);
    }

    /**
     * Upon receipt of search results from a client:
     * Adds these search results to aggregated search results
     * Every result contains the file owner's public key and username but not any identifying information (such as IP address)
     * Results are linked to the search session of the client who made the search
     * This happens before the 1 second timer in "handleSearch" method expires
     */
    private void handleResults(Message msg) {
        UUID searchID = msg.getSearchID();
        Server.SearchSession session = Server.activeSearches.get(searchID);

        if (session != null) {
            String ownerName = this.username; 
            
            // Get the uploader's public key from the server's record
            PublicKey ownerKey = Server.onlineUsers.get(ownerName).publicKey;
            
            // Add each file with the owner's public key to the aggregated results
            for (String fileName : msg.getResults()) {
                session.results.add(new Message.SearchResultEntry(fileName, ownerKey, ownerName));
            }
        }
    }

    /**
     * Upon receipt of download request from a client: Introduces downloader to file owner (uploader)
     * Downloader already encrypted their message to uploader (Server only forwards this message but cannot decrypt it)
     * The introduction includes the downloader's IP address for initiating a peer-to-peer connection
     */
    private void handleIntroduction(Message msg) {
        String fileName = msg.getText();
        String targetClient = msg.getRecipient();
        String requesterIP = socket.getInetAddress().getHostAddress();
        
        if (targetClient != null && Server.onlineUsers.containsKey(targetClient)) {
            Message introMsg = new Message(Message.Type.DOWNLOAD_REQUEST, "Server", fileName);
            introMsg.setRequesterIP(requesterIP);
            introMsg.setP2pPort(msg.getP2pPort());
            introMsg.setRecipient(targetClient);
            introMsg.setEncryptedMessage(msg.getEncryptedMessage());
            whisper(introMsg);
        }
    }

    /**
     * Closes the client connection and updates user list
     */
    public void close_procedure() {
        try {
            if (username != null) {
                Server.onlineUsers.remove(username);
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
     * Broadcasts a message to all connected clients except sender
     */
    private void broadcastExclude(Message msg, String sender) {
        synchronized (Server.onlineUsers) {
            for (Map.Entry<String, ClientRecord> e : Server.onlineUsers.entrySet()) {
                if (!e.getKey().equals(sender)) {
                    try {
                        e.getValue().out.writeObject(msg);
                        e.getValue().out.flush();
                    } catch (IOException ex) {
                        ex.printStackTrace();
                    }
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
            Server.ClientRecord record = Server.onlineUsers.get(targetUser);
            if (record != null && record.out != null) {
                try {
                    record.out.writeObject(msg);
                    record.out.flush();
                } catch (IOException e) {
                    e.printStackTrace();
                }
            }
        }
    }
}

