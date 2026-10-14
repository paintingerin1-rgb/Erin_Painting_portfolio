package shared;

import java.io.Serializable; //converts object to be sent over network
import java.util.ArrayList;


/**
 * message object for Client-Server communication.
 */
public class Message implements Serializable { //allows class to be flattened and sent through socket
    private static final long serialVersionUID = 1L; // Ensures compatibility during serialization

    //categories of messages 
    public enum Type {
        CONNECT, DISCONNECT, GLOBAL, WHISPER, USER_LIST, ERROR
    }

    private Type type;
    private String sender; //username of message sender
    private String recipient; //username of message reciever
    private String text; //text of chat message
    private ArrayList<String> onlineUsers;

    /**
     * Constructor for normal messages
     */
    public Message(Type type, String sender, String text) {
        this.type = type;
        this.sender = sender;
        this.text = text;
    }

    /**
     * Constructor for user list updates
     */
    public Message(Type type, ArrayList<String> onlineUsers) {
        this.type = type;
        this.onlineUsers = onlineUsers;
    }

    // Getters
    public Type getType() { return type; }
    public String getSender() { return sender; }
    public String getRecipient() { return recipient; }
    public String getText() { return text; }
    public ArrayList<String> getOnlineUsers() { return onlineUsers; }

    // Setters
    public void setRecipient(String recipient) { this.recipient = recipient; }
}