package shared;

import java.io.Serializable;

/**
 * This class represents a single data packet in the RBUDP protocol.
 * It is used to chunk files into manageable pieces for transmission.
 */
public class Packet implements Serializable {
    private static final long serialVersionUID = 1L;

    private final int sequenceNumber; // The order of this packet in the file
    private final byte[] data;        // The file content
    private final boolean isLast;     // Flag to tell the receiver the file is done

    /**
     * Constructor for a new packet.
     */
    public Packet(int sequenceNumber, byte[] data, boolean isLast) {
        this.sequenceNumber = sequenceNumber;
        this.data = data;
        this.isLast = isLast;
    }

    // Getters
    public int getSequenceNumber() {
        return sequenceNumber;
    }

    public byte[] getData() {
        return data;
    }

    public boolean isLast() {
        return isLast;
    }
}