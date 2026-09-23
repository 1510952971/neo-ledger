import 'package:flutter/material.dart';

import 'mobile_design.dart';

class MobileEmptyState extends StatelessWidget {
  const MobileEmptyState({
    required this.icon,
    required this.title,
    required this.message,
    super.key,
  });

  final IconData icon;
  final String title;
  final String message;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(28),
    decoration: BoxDecoration(
      color: MobileColors.surface,
      borderRadius: BorderRadius.circular(18),
      border: Border.all(color: MobileColors.line),
    ),
    child: Column(
      children: [
        Icon(icon, size: 38, color: MobileColors.muted),
        const SizedBox(height: 12),
        Text(
          title,
          style: const TextStyle(
            color: Colors.white,
            fontWeight: FontWeight.w800,
          ),
        ),
        const SizedBox(height: 6),
        Text(
          message,
          textAlign: TextAlign.center,
          style: const TextStyle(
            color: MobileColors.muted,
            fontSize: 12,
            height: 1.5,
          ),
        ),
      ],
    ),
  );
}

class MobileInlineError extends StatelessWidget {
  const MobileInlineError({required this.message, this.onRetry, super.key});

  final String message;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) => Container(
    width: double.infinity,
    padding: const EdgeInsets.all(12),
    decoration: BoxDecoration(
      color: const Color(0x22ff8a7a),
      borderRadius: BorderRadius.circular(12),
    ),
    child: Row(
      children: [
        Expanded(
          child: Text(
            message,
            style: const TextStyle(
              color: MobileColors.expense,
              fontSize: 12,
              height: 1.4,
            ),
          ),
        ),
        if (onRetry != null)
          TextButton(onPressed: onRetry, child: const Text('重试')),
      ],
    ),
  );
}

class MobileLoadingView extends StatelessWidget {
  const MobileLoadingView({super.key, this.message = '正在同步你的 Neo Ledger…'});

  final String message;

  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: MobileColors.background,
    body: Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const CircularProgressIndicator(color: MobileColors.brand),
          const SizedBox(height: 18),
          Text(message, style: const TextStyle(color: MobileColors.muted)),
        ],
      ),
    ),
  );
}

class MobileOfflineStatus extends StatelessWidget {
  const MobileOfflineStatus({
    required this.message,
    required this.pendingCount,
    required this.offline,
    required this.onRetry,
    super.key,
  });

  final String message;
  final int pendingCount;
  final bool offline;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    final color = offline ? MobileColors.expense : MobileColors.brand;
    final title = offline ? '离线快照' : '数据待同步';
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: MobileColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: color.withValues(alpha: .32)),
      ),
      child: Row(
        children: [
          Icon(
            offline ? Icons.cloud_off_rounded : Icons.sync_rounded,
            color: color,
            size: 20,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: TextStyle(color: color, fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: 3),
                Text(
                  message,
                  style: const TextStyle(
                    color: MobileColors.muted,
                    fontSize: 12,
                    height: 1.4,
                  ),
                ),
              ],
            ),
          ),
          if (pendingCount > 0) ...[
            const SizedBox(width: 8),
            Semantics(
              label: '$pendingCount 笔待同步或待确认',
              child: CircleAvatar(
                radius: 15,
                backgroundColor: color.withValues(alpha: .16),
                child: Text(
                  '$pendingCount',
                  style: TextStyle(
                    color: color,
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
            ),
          ],
          if (onRetry != null)
            IconButton(
              tooltip: '重试同步',
              onPressed: onRetry,
              icon: Icon(Icons.refresh_rounded, color: color),
            ),
        ],
      ),
    );
  }
}
