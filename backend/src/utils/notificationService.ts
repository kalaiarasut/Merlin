import Notification from '../models/Notification';

export type NotificationType = 'info' | 'success' | 'warning' | 'error';
export type NotificationCategory = 'system' | 'ingestion' | 'analysis' | 'ai' | 'user';

interface CreateNotificationOptions {
  type?: NotificationType;
  category?: NotificationCategory;
  link?: string;
  metadata?: Record<string, any>;
}

class NotificationService {
  /**
   * Create a notification for a specific user
   */
  async create(
    userId: string,
    title: string,
    description: string,
    options: CreateNotificationOptions = {}
  ) {
    try {
      const notification = await Notification.create({
        userId,
        title,
        description,
        type: options.type || 'info',
        category: options.category || 'system',
        link: options.link,
        metadata: options.metadata,
      });
      return notification;
    } catch (error) {
      console.error('Failed to create notification:', error);
      throw error;
    }
  }

  /**
   * Create notifications for data ingestion events
   */
  async notifyIngestionComplete(userId: string, dataType: string, recordCount: number, jobId?: string) {
    return this.create(
      userId,
      'Data Import Completed',
      `Successfully imported ${recordCount.toLocaleString()} ${dataType} records`,
      {
        type: 'success',
        category: 'ingestion',
        link: jobId ? `/ingest?job=${jobId}` : '/ingest',
        metadata: { dataType, recordCount, jobId },
      }
    );
  }

  async notifyIngestionFailed(userId: string, dataType: string, error: string, jobId?: string) {
    return this.create(
      userId,
      'Data Import Failed',
      `Failed to import ${dataType}: ${error}`,
      {
        type: 'error',
        category: 'ingestion',
        link: jobId ? `/ingest?job=${jobId}` : '/ingest',
        metadata: { dataType, error, jobId },
      }
    );
  }

  /**
   * Create notifications for AI analysis events
   */
  async notifyAnalysisComplete(userId: string, analysisType: string, resultId?: string) {
    return this.create(
      userId,
      'Analysis Complete',
      `${analysisType} analysis has finished processing`,
      {
        type: 'success',
        category: 'ai',
        link: resultId ? `/analytics?result=${resultId}` : '/analytics',
        metadata: { analysisType, resultId },
      }
    );
  }

  async notifyOtolithClassified(userId: string, speciesName: string, confidence: number, otolithId: string) {
    return this.create(
      userId,
      'Otolith Classification Ready',
      `Identified as ${speciesName} (${(confidence * 100).toFixed(1)}% confidence)`,
      {
        type: 'success',
        category: 'analysis',
        link: `/otolith?id=${otolithId}`,
        metadata: { speciesName, confidence, otolithId },
      }
    );
  }

  /**
   * Create system notifications
   */
  async notifySystemUpdate(userId: string, message: string) {
    return this.create(
      userId,
      'System Update',
      message,
      {
        type: 'info',
        category: 'system',
      }
    );
  }

  async notifyMaintenanceScheduled(userId: string, scheduledTime: Date) {
    return this.create(
      userId,
      'Maintenance Scheduled',
      `Platform maintenance is scheduled for ${scheduledTime.toLocaleString()}`,
      {
        type: 'warning',
        category: 'system',
        metadata: { scheduledTime: scheduledTime.toISOString() },
      }
    );
  }

  /**
   * Broadcast notification to all users
   */
  async broadcast(title: string, description: string, options: CreateNotificationOptions = {}) {
    try {
      const User = require('../models/User').default;
      const users = await User.find({}, '_id');
      
      const notifications = await Promise.all(
        users.map((user: any) =>
          this.create(user._id.toString(), title, description, options)
        )
      );
      
      return notifications;
    } catch (error) {
      console.error('Failed to broadcast notification:', error);
      throw error;
    }
  }

  /**
   * Get unread count for a user
   */
  async getUnreadCount(userId: string): Promise<number> {
    return Notification.countDocuments({ userId, read: false });
  }

  /**
   * Mark all notifications as read for a user
   */
  async markAllRead(userId: string) {
    return Notification.updateMany({ userId, read: false }, { read: true });
  }

  /**
   * Delete old notifications (cleanup job)
   */
  async cleanupOldNotifications(daysOld: number = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    
    const result = await Notification.deleteMany({
      createdAt: { $lt: cutoffDate },
      read: true,
    });
    
    return result.deletedCount;
  }
}

export const notificationService = new NotificationService();
export default notificationService;
