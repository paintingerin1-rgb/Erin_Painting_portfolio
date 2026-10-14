package shared;

import java.io.Serializable; //converts object to be sent over network
import java.security.PublicKey;
import java.util.List;
import java.util.UUID;
import security.EncryptedMessage;


/**
 * Message object for Client-Server communication
 * Note that this code is modified from Project 1
 * @author Erin Painting & Kayla de Beer
 */
public class Message implements Serializable { //allows class to be flattened and sent through socket
    private static final long serialVersionUID = 1L; // Ensures compatibility during serialization

    //categories of messages 
    public enum Type {
        CONNECT, DISCONNECT, SEARCH_REQUEST, SEARCH_RESULT, DOWNLOAD_REQUEST, ERROR
    }

    private Type type;
    private String sender; //username of message sender
    private String text; // search string
    private String recipient; //username of message receiver
    private List<String> searchResults; // from the clients
    private UUID searchID; // unique search ID
    private String requesterIP;
    private PublicKey publicKey; // the message key of the download requester
    private List<SearchResultEntry> searchResultsServer; // from the clients
    private EncryptedMessage encryptedMessage; // encrypted download request from client
    private int p2pPort;

    /**
     * Constructor for server-client messages
     * Signalling only
     */
    public Message(Type type, String sender, String text) {
        this.type = type;
        this.sender = sender;
        this.text = text;
    }

    /**
     * Constructor for search results from clients
     */
    public Message(List<String> results, String sender) {
        this.type = Type.SEARCH_RESULT;
        this.sender = sender;
        this.searchResults = results;
    }

    /**
     * Constructor for search results from server
     */
    public Message(List<SearchResultEntry> results) {
        this.type = Type.SEARCH_RESULT;
        this.sender = "Server";
        this.searchResultsServer = results;
    }

    // Getters
    public Type getType() { return type; }
    public String getSender() { return sender; }
    public String getRecipient() { return recipient; }
    public String getText() { return text; }
    public List<String> getResults() { return searchResults; }
    public List<SearchResultEntry> getResultsServer() { return searchResultsServer; }
    public UUID getSearchID() { return searchID; }
    public PublicKey getPublicKey() { return publicKey; }
    public String getRequesterIP() { return requesterIP; }
    public EncryptedMessage getEncryptedMessage() { return encryptedMessage; }
    public int getP2pPort() { return p2pPort; }
    

    // Setters
    public void setRecipient(String recipient) { this.recipient = recipient; }
    public void setSearchID(UUID searchID) { this.searchID = searchID; }
    public void setpublicKey(PublicKey publicKey) { this.publicKey = publicKey; }
    public void setRequesterIP(String requesterIP) { this.requesterIP = requesterIP; }
    public void setEncryptedMessage(EncryptedMessage encryptedMessage) { this.encryptedMessage = encryptedMessage; }
    public void setP2pPort(int p2pPort) { this.p2pPort = p2pPort; }

    /**
     * A helper class to store search results and distribute public keys for encryption
     */
    public static class SearchResultEntry implements Serializable {
        public String fileName;
        public PublicKey ownerKey;
        public String ownerUsername;
        
        public SearchResultEntry(String fileName, PublicKey ownerKey, String ownerUsername) {
            this.fileName = fileName;
            this.ownerKey = ownerKey;
            this.ownerUsername = ownerUsername;
        }
    }
}
