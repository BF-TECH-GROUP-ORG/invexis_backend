// ChatRoomManager.js - WhatsApp-like group management
const { redis } = require('../config/shared');
const logger = require('./logger');

class ChatRoomManager {
    constructor(io) {
        this.io = io;
        this.redis = redis;
    }

    // Create a new chat group
    async createGroup(groupId, creatorId, name, participants = []) {
        const groupKey = `chat:group:${groupId}`;
        const groupInfo = {
            id: groupId,
            name,
            creator: creatorId,
            created: Date.now(),
            participants: [creatorId, ...participants],
            type: 'group'
        };

        try {
            // Store group info
            await this.redis.set(
                `info:${groupKey}`,
                JSON.stringify(groupInfo),
                'EX',
                365 * 24 * 60 * 60 // 1 year expiry
            );

            // Add participants to group set
            await this.redis.sadd(`members:${groupKey}`, creatorId, ...participants);

            // Subscribe all online participants to the room
            const sockets = await this.io.fetchSockets();
            for (const socket of sockets) {
                if (groupInfo.participants.includes(socket.userId)) {
                    await socket.join(groupKey);
                }
            }

            // Notify participants
            this.io.to(groupKey).emit('group.created', {
                groupId,
                name,
                creator: creatorId,
                participants: groupInfo.participants
            });

            return groupInfo;
        } catch (error) {
            logger.error('Failed to create chat group:', error);
            throw error;
        }
    }

    // Add participants to group
    async addParticipants(groupId, participantIds) {
        const groupKey = `chat:group:${groupId}`;

        try {
            // Add to Redis set
            await this.redis.sadd(`members:${groupKey}`, ...participantIds);

            // Add online participants to Socket.IO room
            const sockets = await this.io.fetchSockets();
            for (const socket of sockets) {
                if (participantIds.includes(socket.userId)) {
                    await socket.join(groupKey);
                }
            }

            // Notify group
            this.io.to(groupKey).emit('group.membersAdded', {
                groupId,
                newMembers: participantIds
            });

            return true;
        } catch (error) {
            logger.error('Failed to add participants:', error);
            throw error;
        }
    }

    // Remove participants from group
    async removeParticipants(groupId, participantIds) {
        const groupKey = `chat:group:${groupId}`;

        try {
            // Remove from Redis set
            await this.redis.srem(`members:${groupKey}`, ...participantIds);

            // Remove from Socket.IO room
            const sockets = await this.io.fetchSockets();
            for (const socket of sockets) {
                if (participantIds.includes(socket.userId)) {
                    await socket.leave(groupKey);
                }
            }

            // Notify group
            this.io.to(groupKey).emit('group.membersRemoved', {
                groupId,
                removedMembers: participantIds
            });

            return true;
        } catch (error) {
            logger.error('Failed to remove participants:', error);
            throw error;
        }
    }

    // Get group info
    async getGroupInfo(groupId) {
        const groupKey = `chat:group:${groupId}`;
        try {
            const info = await this.redis.get(`info:${groupKey}`);
            if (!info) return null;

            const members = await this.redis.smembers(`members:${groupKey}`);
            return {
                ...JSON.parse(info),
                currentParticipants: members
            };
        } catch (error) {
            logger.error('Failed to get group info:', error);
            throw error;
        }
    }

    // Check if user is group member
    async isGroupMember(groupId, userId) {
        const groupKey = `chat:group:${groupId}`;
        return await this.redis.sismember(`members:${groupKey}`, userId);
    }

    // Get user's groups
    async getUserGroups(userId) {
        try {
            const groups = [];
            const keys = await this.redis.keys('info:chat:group:*');

            for (const key of keys) {
                const groupId = key.split(':')[3];
                if (await this.isGroupMember(groupId, userId)) {
                    const info = await this.getGroupInfo(groupId);
                    if (info) groups.push(info);
                }
            }

            return groups;
        } catch (error) {
            logger.error('Failed to get user groups:', error);
            throw error;
        }
    }

    // Handle member presence (online/offline)
    async updatePresence(userId, status) {
        try {
            const groups = await this.getUserGroups(userId);
            for (const group of groups) {
                this.io.to(`chat:group:${group.id}`).emit('member.presence', {
                    groupId: group.id,
                    userId,
                    status,
                    timestamp: Date.now()
                });
            }
        } catch (error) {
            logger.error('Failed to update presence:', error);
        }
    }

    // Track message delivery status
    async trackMessageDelivery(groupId, messageId, senderId) {
        const deliveryKey = `delivery:${groupId}:${messageId}`;
        const members = await this.redis.smembers(`members:chat:group:${groupId}`);

        // Initialize delivery tracking for all members
        const delivery = members.reduce((acc, memberId) => {
            acc[memberId] = {
                delivered: false,
                seen: false,
                timestamp: null
            };
            return acc;
        }, {});

        await this.redis.set(deliveryKey, JSON.stringify(delivery), 'EX', 7 * 24 * 60 * 60); // 7 days
        return delivery;
    }

    // Update message status (delivered/seen)
    async updateMessageStatus(groupId, messageId, userId, status) {
        const deliveryKey = `delivery:${groupId}:${messageId}`;
        try {
            const delivery = JSON.parse(await this.redis.get(deliveryKey) || '{}');
            if (delivery[userId]) {
                delivery[userId][status] = true;
                delivery[userId].timestamp = Date.now();
                await this.redis.set(deliveryKey, JSON.stringify(delivery), 'KEEPTTL');

                // Notify about status update
                this.io.to(`chat:group:${groupId}`).emit('message.status', {
                    groupId,
                    messageId,
                    userId,
                    status,
                    timestamp: Date.now()
                });
            }
            return delivery;
        } catch (error) {
            logger.error('Failed to update message status:', error);
            throw error;
        }
    }
}

module.exports = ChatRoomManager;