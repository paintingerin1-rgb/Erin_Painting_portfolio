package client.audio;

import java.net.DatagramPacket;
import java.net.DatagramSocket;
import javax.sound.sampled.AudioFormat;
import javax.sound.sampled.AudioSystem;
import javax.sound.sampled.DataLine;
import javax.sound.sampled.SourceDataLine;

/**
 * Thread responsible for receiving UDP audio packets and playing them to the speaker.
 */
public class AudioReciever extends Thread {
    
    private boolean isRunning = false;
    private int listenPort;
    private SourceDataLine speakerLine; 
    private DatagramSocket udpSocket;

    public AudioReciever(int listenPort) {
        this.listenPort = listenPort;
    }

    @Override
    public void run() {
        isRunning = true;
        
        try {
            udpSocket = new DatagramSocket(listenPort);

            AudioFormat format = AudioConfig.getFormat();
            DataLine.Info info = new DataLine.Info(SourceDataLine.class, format);

            speakerLine = (SourceDataLine) AudioSystem.getLine(info);
            speakerLine.open(format);
            speakerLine.start();

            System.out.println("Speaker successfully opened and ready to play...");

            byte[] receiveBuffer = new byte[1024];

            while (isRunning) {
                DatagramPacket packet = new DatagramPacket(receiveBuffer, receiveBuffer.length);
                
                // Blocks until a packet arrives, then immediately processes it
                udpSocket.receive(packet); 
                
                // Direct pipe: Network straight to the speaker buffer
                speakerLine.write(packet.getData(), 0, packet.getLength());
            }
        } catch(Exception e) {
            if (isRunning) {
                System.err.println("Error receiving audio: " + e.getMessage());
            }
        } finally {
            if (speakerLine != null) {
                speakerLine.drain(); 
                speakerLine.close();
            }
            if (udpSocket != null && !udpSocket.isClosed()) {
                udpSocket.close();
            }
        }
    }

    public void stopReceiving() {
        isRunning = false;
        if (udpSocket != null && !udpSocket.isClosed()) {
            udpSocket.close();
        }
    }
}