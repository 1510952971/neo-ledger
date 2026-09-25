import 'package:flutter/material.dart';

import '../../api_client.dart';
import '../../models.dart';

class MobileTagManagerSheet extends StatefulWidget {
  const MobileTagManagerSheet({
    required this.api,
    required this.ledgerId,
    super.key,
  });

  final NeoLedgerApi api;
  final int ledgerId;

  @override
  State<MobileTagManagerSheet> createState() => _MobileTagManagerSheetState();
}

class _MobileTagManagerSheetState extends State<MobileTagManagerSheet> {
  List<LedgerTag> _tags = const [];
  bool _loading = true;
  String? _error;
  String? _busyTag;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final tags = await widget.api.fetchTags(widget.ledgerId);
      if (!mounted) return;
      setState(() => _tags = tags);
    } catch (error) {
      if (!mounted) return;
      setState(() => _error = '$error');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _rename(LedgerTag tag) async {
    final editor = TextEditingController(text: tag.name);
    final value = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('重命名标签'),
        content: TextField(
          controller: editor,
          autofocus: true,
          maxLength: 24,
          decoration: const InputDecoration(
            labelText: '标签名称',
            hintText: '例如：工作、报销',
          ),
          onSubmitted: (value) => Navigator.pop(dialogContext, value.trim()),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: const Text('取消'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, editor.text.trim()),
            child: const Text('保存'),
          ),
        ],
      ),
    );
    editor.dispose();
    final normalized = value?.trim() ?? '';
    if (!mounted || normalized.isEmpty || normalized == tag.name) return;
    setState(() => _busyTag = tag.name);
    try {
      await widget.api.renameTag(
        ledgerId: widget.ledgerId,
        from: tag.name,
        to: normalized,
      );
      await _load();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('已将“${tag.name}”重命名为“$normalized”')),
        );
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('重命名失败：$error')));
      }
    } finally {
      if (mounted) setState(() => _busyTag = null);
    }
  }

  Future<void> _delete(LedgerTag tag) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('删除这个标签？'),
        content: Text(
          '将从当前账本的 ${tag.count} 笔流水中移除“${tag.name}”。流水本身、金额和分类不会删除。',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('取消'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('移除标签'),
          ),
        ],
      ),
    );
    if (!mounted || confirmed != true) return;
    setState(() => _busyTag = tag.name);
    try {
      await widget.api.deleteTag(ledgerId: widget.ledgerId, name: tag.name);
      await _load();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('已从 ${tag.count} 笔流水中移除“${tag.name}”')),
        );
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('移除标签失败：$error')));
      }
    } finally {
      if (mounted) setState(() => _busyTag = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.viewInsetsOf(context).bottom;
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(20, 12, 20, bottom + 24),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxHeight: 620),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      '标签词库',
                      style: Theme.of(context).textTheme.headlineSmall,
                    ),
                  ),
                  IconButton(
                    tooltip: '刷新标签',
                    onPressed: _loading ? null : _load,
                    icon: const Icon(Icons.refresh_rounded),
                  ),
                ],
              ),
              const SizedBox(height: 6),
              const Text(
                '标签来自当前账本已有流水。重命名和移除会同步到 Web、Windows、macOS 与其他移动设备；不会删除流水。',
                style: TextStyle(height: 1.4),
              ),
              const SizedBox(height: 14),
              if (_loading)
                const Expanded(
                  child: Center(child: CircularProgressIndicator()),
                )
              else if (_error != null)
                Expanded(
                  child: Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(_error!, textAlign: TextAlign.center),
                        const SizedBox(height: 10),
                        OutlinedButton(
                          onPressed: _load,
                          child: const Text('重新加载'),
                        ),
                      ],
                    ),
                  ),
                )
              else if (_tags.isEmpty)
                const Expanded(
                  child: Center(
                    child: Text(
                      '当前账本还没有使用过标签\n在记账页添加标签后会显示在这里',
                      textAlign: TextAlign.center,
                    ),
                  ),
                )
              else
                Expanded(
                  child: ListView.separated(
                    itemCount: _tags.length,
                    separatorBuilder: (_, _) => const Divider(height: 1),
                    itemBuilder: (context, index) {
                      final tag = _tags[index];
                      final busy = _busyTag == tag.name;
                      return ListTile(
                        contentPadding: EdgeInsets.zero,
                        leading: CircleAvatar(
                          radius: 17,
                          backgroundColor: Theme.of(context).colorScheme.primary
                              .withValues(alpha: 0.15),
                          child: Icon(
                            Icons.tag_rounded,
                            size: 18,
                            color: Theme.of(context).colorScheme.primary,
                          ),
                        ),
                        title: Text(tag.name),
                        subtitle: Text('${tag.count} 笔流水'),
                        trailing: busy
                            ? const SizedBox(
                                width: 22,
                                height: 22,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                ),
                              )
                            : Wrap(
                                spacing: 0,
                                children: [
                                  IconButton(
                                    tooltip: '重命名标签',
                                    onPressed: () => _rename(tag),
                                    icon: const Icon(Icons.edit_outlined),
                                  ),
                                  IconButton(
                                    tooltip: '移除标签',
                                    onPressed: () => _delete(tag),
                                    icon: const Icon(
                                      Icons.delete_outline_rounded,
                                    ),
                                  ),
                                ],
                              ),
                      );
                    },
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
