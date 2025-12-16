# WebSocket Service API Documentation

## Connection

### Base URL
```javascript
const WEBSOCKET_URL = 'ws://localhost:9002'; // Development
// or
const WEBSOCKET_URL = 'wss://your-domain.com'; // Production (SSL)
```

### Client Connection (using Socket.IO client)
```javascript
import { io } from 'socket.io-client';

const socket = io(WEBSOCKET_URL, {
    transports: ['websocket'],
    auth: {
        token: 'your-jwt-token'  // Required for authentication
    },
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: Infinity
});

// Connection event handlers
socket.on('connect', () => {
    console.log('Connected to WebSocket server');
    console.log('Socket ID:', socket.id);
});

socket.on('connected', (data) => {
    console.log('Connection confirmed:', data);
    // data includes: { userId, socketId, worker }
});

socket.on('disconnect', (reason) => {
    console.log('Disconnected:', reason);
});

socket.on('error', (error) => {
    console.error('Socket error:', error);
});
```

## Room Management

### Join Rooms
```javascript
// Join one or more rooms
socket.emit('join', ['room1', 'room2'], (response) => {
    if (response.success) {
        console.log('Joined rooms:', response.rooms);
    } else {
        console.error('Failed to join rooms:', response.message);
    }
});
```

### Leave Rooms
```javascript
// Leave one or more rooms
socket.emit('leave', ['room1', 'room2'], (response) => {
    if (response.success) {
        console.log('Left rooms:', response.rooms);
    } else {
        console.error('Failed to leave rooms:', response.message);
    }
});
```

## Event Handling

### Auth Events
```javascript
// Listen for user registration events
socket.on('user.registered', (data) => {
    console.log('New user registered:', data);
    // data includes: { userId, user, source, ts }
});

// Listen for login events
socket.on('user.login', (data) => {
    console.log('User logged in:', data);
    // data includes: { userId, source, ts }
});

// Listen for logout events
socket.on('user.logout', (data) => {
    console.log('User logged out:', data);
    // data includes: { userId, source, ts }
});

// Listen for user update events
socket.on('user.updated', (data) => {
    console.log('User updated:', data);
    // data includes: { userId, updates, source, ts }
});
```

### Realtime Events
```javascript
// Example of handling custom realtime events
socket.on('notification', (data) => {
    console.log('New notification:', data);
});

socket.on('message', (data) => {
    console.log('New message:', data);
});

// Acknowledge receipt of messages
socket.emit('ack', { eventId: 'xyz', status: 'received' });
```

## Error Handling and Reconnection

```javascript
// Handle connection errors
socket.on('connect_error', (error) => {
    console.error('Connection error:', error);
    // Implement exponential backoff or retry logic
});

// Handle reconnection attempts
socket.on('reconnect_attempt', (attemptNumber) => {
    console.log('Reconnection attempt:', attemptNumber);
});

socket.on('reconnect', (attemptNumber) => {
    console.log('Reconnected after', attemptNumber, 'attempts');
    // Resubscribe to rooms or refresh state if needed
});
```

## Best Practices

1. **Connection Management**
   - Always provide an auth token
   - Implement reconnection logic
   - Handle disconnections gracefully

2. **Room Management**
   - Join only necessary rooms
   - Leave rooms when they're no longer needed
   - Handle join/leave failures

3. **Event Handling**
   - Use try/catch in event handlers
   - Acknowledge message receipt when required
   - Implement error handling for each event type

4. **Performance**
   - Use WebSocket transport when possible
   - Batch operations when joining/leaving multiple rooms
   - Implement proper cleanup on disconnect

5. **Security**
   - Never send sensitive data in plain text
   - Validate data before processing
   - Implement rate limiting on client side

## Rate Limits and Quotas

- Maximum connections per IP: 100
- Maximum rooms per user: 50
- Message rate limit: 100 messages per second
- Maximum payload size: 100KB
- Room join rate: 10 joins per minute

## Example React Implementation

```javascript
import React, { useEffect, useContext, createContext } from 'react';
import { io } from 'socket.io-client';

const SocketContext = createContext(null);

export const SocketProvider = ({ children }) => {
    const [socket, setSocket] = useState(null);
    const [connected, setConnected] = useState(false);

    useEffect(() => {
        // Initialize socket connection
        const socket = io(WEBSOCKET_URL, {
            transports: ['websocket'],
            auth: {
                token: localStorage.getItem('jwt_token')
            }
        });

        // Connection events
        socket.on('connect', () => {
            setConnected(true);
            console.log('Connected to WebSocket');
        });

        socket.on('disconnect', () => {
            setConnected(false);
            console.log('Disconnected from WebSocket');
        });

        // Cleanup on unmount
        return () => {
            socket.disconnect();
        };
    }, []);

    return (
        <SocketContext.Provider value={{ socket, connected }}>
            {children}
        </SocketContext.Provider>
    );
};

// Hook for using socket in components
export const useSocket = () => {
    const context = useContext(SocketContext);
    if (!context) {
        throw new Error('useSocket must be used within a SocketProvider');
    }
    return context;
};

// Example component using socket
const ChatRoom = () => {
    const { socket, connected } = useSocket();
    const [messages, setMessages] = useState([]);

    useEffect(() => {
        if (!socket) return;

        // Join chat room
        socket.emit('join', ['chat:general']);

        // Listen for messages
        socket.on('message', (message) => {
            setMessages(prev => [...prev, message]);
        });

        // Cleanup
        return () => {
            socket.emit('leave', ['chat:general']);
            socket.off('message');
        };
    }, [socket]);

    return (
        <div>
            {connected ? 'Connected' : 'Disconnected'}
            {messages.map(msg => (
                <div key={msg.id}>{msg.content}</div>
            ))}
        </div>
    );
};
```