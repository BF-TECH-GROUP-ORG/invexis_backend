// ==================================================================================
// SLACK NOTIFICATION CONFIGURATION - INVEXIS PRODUCTION
// ==================================================================================
// This module handles Slack notifications for deployment and monitoring alerts
// ==================================================================================

const axios = require('axios');

class SlackNotifier {
    constructor(config = {}) {
        this.webhookUrl = config.webhookUrl || process.env.SLACK_WEBHOOK_URL;
        this.defaultChannel = config.defaultChannel || process.env.SLACK_CHANNEL || '#deployment-prod';
        this.username = config.username || 'Invexis Production Bot';
        this.iconEmoji = config.iconEmoji || ':gear:';
    }

    /**
     * Send a notification to Slack
     * @param {Object} options - Notification options
     */
    async sendNotification(options) {
        const {
            message,
            channel = this.defaultChannel,
            color = 'good',
            fields = [],
            attachments = [],
            username = this.username,
            iconEmoji = this.iconEmoji
        } = options;

        const payload = {
            channel,
            username,
            icon_emoji: iconEmoji,
            text: message,
            attachments: [
                {
                    color,
                    fields,
                    ts: Math.floor(Date.now() / 1000),
                    ...attachments[0]
                }
            ]
        };

        try {
            const response = await axios.post(this.webhookUrl, payload);
            console.log('Slack notification sent successfully');
            return response.data;
        } catch (error) {
            console.error('Failed to send Slack notification:', error.message);
            throw error;
        }
    }

    /**
     * Send deployment start notification
     */
    async deploymentStarted(deploymentInfo) {
        const message = `🚀 *Deployment Started*\nVersion: ${deploymentInfo.version}`;
        
        const fields = [
            {
                title: 'Environment',
                value: deploymentInfo.environment,
                short: true
            },
            {
                title: 'Strategy',
                value: deploymentInfo.strategy,
                short: true
            },
            {
                title: 'Commit',
                value: deploymentInfo.commit,
                short: true
            },
            {
                title: 'Branch',
                value: deploymentInfo.branch,
                short: true
            }
        ];

        return this.sendNotification({
            message,
            color: 'warning',
            fields,
            channel: '#deployment-prod'
        });
    }

    /**
     * Send deployment success notification
     */
    async deploymentSuccess(deploymentInfo) {
        const message = `✅ *Deployment Successful*\nVersion ${deploymentInfo.version} is now live!`;
        
        const fields = [
            {
                title: 'Environment',
                value: deploymentInfo.environment,
                short: true
            },
            {
                title: 'Duration',
                value: deploymentInfo.duration,
                short: true
            },
            {
                title: 'Services Updated',
                value: deploymentInfo.servicesUpdated.join(', '),
                short: false
            },
            {
                title: 'Dashboard',
                value: `<https://grafana.${process.env.DOMAIN}|View Metrics>`,
                short: true
            }
        ];

        return this.sendNotification({
            message,
            color: 'good',
            fields,
            channel: '#deployment-prod'
        });
    }

    /**
     * Send deployment failure notification
     */
    async deploymentFailed(deploymentInfo) {
        const message = `❌ *Deployment Failed*\nVersion ${deploymentInfo.version} deployment failed!`;
        
        const fields = [
            {
                title: 'Environment',
                value: deploymentInfo.environment,
                short: true
            },
            {
                title: 'Error',
                value: deploymentInfo.error,
                short: false
            },
            {
                title: 'Build Log',
                value: `<${deploymentInfo.buildUrl}|View Build Log>`,
                short: true
            },
            {
                title: 'Action Required',
                value: 'Please check the build logs and fix the issues',
                short: false
            }
        ];

        return this.sendNotification({
            message,
            color: 'danger',
            fields,
            channel: '#deployment-prod'
        });
    }

    /**
     * Send service health alert
     */
    async serviceHealthAlert(alertInfo) {
        const { serviceName, status, description, severity } = alertInfo;
        
        const emoji = severity === 'critical' ? '🚨' : '⚠️';
        const color = severity === 'critical' ? 'danger' : 'warning';
        
        const message = `${emoji} *Service Alert: ${serviceName}*\nStatus: ${status}`;
        
        const fields = [
            {
                title: 'Service',
                value: serviceName,
                short: true
            },
            {
                title: 'Severity',
                value: severity.toUpperCase(),
                short: true
            },
            {
                title: 'Description',
                value: description,
                short: false
            },
            {
                title: 'Timestamp',
                value: new Date().toISOString(),
                short: true
            }
        ];

        return this.sendNotification({
            message,
            color,
            fields,
            channel: '#alerts-prod'
        });
    }

    /**
     * Send performance alert
     */
    async performanceAlert(alertInfo) {
        const { metric, value, threshold, serviceName } = alertInfo;
        
        const message = `📈 *Performance Alert*\n${metric} is above threshold for ${serviceName}`;
        
        const fields = [
            {
                title: 'Service',
                value: serviceName,
                short: true
            },
            {
                title: 'Metric',
                value: metric,
                short: true
            },
            {
                title: 'Current Value',
                value: value.toString(),
                short: true
            },
            {
                title: 'Threshold',
                value: threshold.toString(),
                short: true
            },
            {
                title: 'Dashboard',
                value: `<https://grafana.${process.env.DOMAIN}/d/performance|View Performance>`,
                short: false
            }
        ];

        return this.sendNotification({
            message,
            color: 'warning',
            fields,
            channel: '#alerts-prod'
        });
    }

    /**
     * Send security alert
     */
    async securityAlert(alertInfo) {
        const { eventType, description, sourceIp, severity } = alertInfo;
        
        const message = `🔒 *Security Alert*\n${eventType} detected`;
        
        const fields = [
            {
                title: 'Event Type',
                value: eventType,
                short: true
            },
            {
                title: 'Severity',
                value: severity.toUpperCase(),
                short: true
            },
            {
                title: 'Source IP',
                value: sourceIp || 'Unknown',
                short: true
            },
            {
                title: 'Timestamp',
                value: new Date().toISOString(),
                short: true
            },
            {
                title: 'Description',
                value: description,
                short: false
            }
        ];

        return this.sendNotification({
            message,
            color: 'danger',
            fields,
            channel: '#security-alerts'
        });
    }

    /**
     * Send backup notification
     */
    async backupNotification(backupInfo) {
        const { status, databases, duration, size } = backupInfo;
        
        const emoji = status === 'success' ? '✅' : '❌';
        const color = status === 'success' ? 'good' : 'danger';
        
        const message = `${emoji} *Database Backup ${status === 'success' ? 'Completed' : 'Failed'}*`;
        
        const fields = [
            {
                title: 'Databases',
                value: databases.join(', '),
                short: true
            },
            {
                title: 'Duration',
                value: duration,
                short: true
            },
            {
                title: 'Size',
                value: size,
                short: true
            },
            {
                title: 'Timestamp',
                value: new Date().toISOString(),
                short: true
            }
        ];

        return this.sendNotification({
            message,
            color,
            fields,
            channel: '#maintenance'
        });
    }

    /**
     * Send maintenance window notification
     */
    async maintenanceNotification(maintenanceInfo) {
        const { type, startTime, duration, description } = maintenanceInfo;
        
        const message = `🔧 *Maintenance ${type}*\n${description}`;
        
        const fields = [
            {
                title: 'Start Time',
                value: startTime,
                short: true
            },
            {
                title: 'Expected Duration',
                value: duration,
                short: true
            },
            {
                title: 'Type',
                value: type,
                short: true
            },
            {
                title: 'Impact',
                value: maintenanceInfo.impact || 'Minimal',
                short: true
            }
        ];

        return this.sendNotification({
            message,
            color: 'warning',
            fields,
            channel: '#maintenance'
        });
    }
}

// Export configured instance
const slackNotifier = new SlackNotifier({
    webhookUrl: process.env.SLACK_WEBHOOK_URL,
    defaultChannel: process.env.SLACK_CHANNEL,
    username: 'Invexis Production Bot',
    iconEmoji: ':gear:'
});

module.exports = {
    SlackNotifier,
    slackNotifier
};

// ==================================================================================
// USAGE EXAMPLES
// ==================================================================================

/*
// Deployment notifications
await slackNotifier.deploymentStarted({
    version: '1.2.3',
    environment: 'production',
    strategy: 'blue-green',
    commit: 'abc123',
    branch: 'main'
});

await slackNotifier.deploymentSuccess({
    version: '1.2.3',
    environment: 'production',
    duration: '5 minutes',
    servicesUpdated: ['api-gateway', 'auth-service']
});

// Service alerts
await slackNotifier.serviceHealthAlert({
    serviceName: 'api-gateway',
    status: 'unhealthy',
    description: 'High response time detected',
    severity: 'warning'
});

// Performance alerts
await slackNotifier.performanceAlert({
    serviceName: 'payment-service',
    metric: 'response_time_95p',
    value: 5.2,
    threshold: 2.0
});

// Security alerts
await slackNotifier.securityAlert({
    eventType: 'Multiple Failed Login Attempts',
    description: 'Detected 10+ failed login attempts from same IP',
    sourceIp: '192.168.1.100',
    severity: 'high'
});
*/