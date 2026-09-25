part of '../../mobile_ledger_shell.dart';

class MobileAddTransactionPage extends StatefulWidget {
  const MobileAddTransactionPage({
    super.key,
    required this.controller,
    this.initialType = '支出',
    this.initialDraft,
  });

  final LedgerController controller;
  final String initialType;
  final ShortcutEntryDraft? initialDraft;

  @override
  State<MobileAddTransactionPage> createState() =>
      _MobileAddTransactionPageState();
}

class _MobileHomeModuleSettings extends StatefulWidget {
  const _MobileHomeModuleSettings({required this.controller});

  final LedgerController controller;

  @override
  State<_MobileHomeModuleSettings> createState() =>
      _MobileHomeModuleSettingsState();
}

class _MobileHomeModuleSettingsState extends State<_MobileHomeModuleSettings> {
  static const _defaults = [
    'summary',
    'weeklyTrend',
    'budget',
    'pending',
    'recent',
  ];
  static const _labels = {
    'summary': ('本月收支', '收入、支出和结余概览'),
    'weeklyTrend': ('近 7 日支出', '查看最近一周的消费趋势'),
    'budget': ('预算进度', '显示分类预算使用情况'),
    'pending': ('待确认账单', '显示自动识别后等待确认的流水'),
    'recent': ('最近账单', '显示最近发生的流水'),
  };

  late List<String> _modules;
  late Set<String> _enabled;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    final stored = widget.controller.preferences.homeModules;
    _modules = [
      ...stored.where(_defaults.contains),
      ..._defaults.where((item) => !stored.contains(item)),
    ];
    _enabled = stored.isEmpty ? _defaults.toSet() : stored.toSet();
  }

  Future<void> _save() async {
    if (_enabled.isEmpty) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('至少保留一个首页模块')));
      return;
    }
    setState(() => _saving = true);
    try {
      await widget.controller.saveMobileSettings(
        homeModules: _modules.where(_enabled.contains).toList(),
      );
      if (mounted) Navigator.pop(context);
    } catch (error) {
      if (mounted) {
        setState(() => _saving = false);
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('首页模块设置失败：$error')));
      }
    }
  }

  @override
  Widget build(BuildContext context) => SafeArea(
    child: Padding(
      padding: const EdgeInsets.fromLTRB(18, 4, 18, 24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text(
            '首页模块',
            style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 6),
          Text(
            '拖动调整顺序，关闭后不会再占用首页空间；设置会同步到其他设备。',
            style: TextStyle(color: _mobileMuted, height: 1.4),
          ),
          const SizedBox(height: 10),
          ConstrainedBox(
            constraints: const BoxConstraints(maxHeight: 360),
            child: ReorderableListView.builder(
              shrinkWrap: true,
              itemCount: _modules.length,
              onReorderItem: (oldIndex, newIndex) {
                setState(() {
                  final item = _modules.removeAt(oldIndex);
                  _modules.insert(newIndex, item);
                });
              },
              itemBuilder: (context, index) {
                final key = _modules[index];
                final definition = _labels[key]!;
                return CheckboxListTile(
                  key: ValueKey(key),
                  value: _enabled.contains(key),
                  onChanged: _saving
                      ? null
                      : (value) => setState(() {
                          if (value == true) {
                            _enabled.add(key);
                          } else {
                            _enabled.remove(key);
                          }
                        }),
                  title: Text(definition.$1),
                  subtitle: Text(
                    definition.$2,
                    style: TextStyle(color: _mobileMuted, fontSize: 12),
                  ),
                  secondary: const Icon(Icons.drag_handle_rounded),
                  activeColor: _mobileBrand,
                  contentPadding: EdgeInsets.zero,
                );
              },
            ),
          ),
          const SizedBox(height: 12),
          FilledButton(
            onPressed: _saving ? null : _save,
            child: Text(_saving ? '保存中…' : '保存首页布局'),
          ),
        ],
      ),
    ),
  );
}

class _MobileExperienceSettings extends StatefulWidget {
  const _MobileExperienceSettings({required this.controller});

  final LedgerController controller;

  @override
  State<_MobileExperienceSettings> createState() =>
      _MobileExperienceSettingsState();
}

class _MobileExperienceSettingsState extends State<_MobileExperienceSettings> {
  bool _haptics = true;
  bool _continuous = false;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (mounted) {
      setState(() {
        _haptics = widget.controller.preferences.hapticsEnabled;
        _continuous = widget.controller.preferences.continuousEntry;
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) => SafeArea(
    child: Padding(
      padding: const EdgeInsets.fromLTRB(18, 4, 18, 24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text(
            '记账体验',
            style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 12),
          SwitchListTile.adaptive(
            contentPadding: EdgeInsets.zero,
            title: const Text('按键触觉反馈'),
            subtitle: Text(
              '输入金额时提供轻触反馈',
              style: TextStyle(color: _mobileMuted),
            ),
            value: _haptics,
            onChanged: _loading
                ? null
                : (value) async {
                    setState(() => _haptics = value);
                    try {
                      await widget.controller.saveMobileSettings(
                        hapticsEnabled: value,
                      );
                    } catch (error) {
                      if (context.mounted) {
                        setState(() => _haptics = !value);
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(content: Text('触觉设置失败：$error')),
                        );
                      }
                    }
                    if (value) HapticFeedback.selectionClick();
                  },
          ),
          SwitchListTile.adaptive(
            contentPadding: EdgeInsets.zero,
            title: const Text('默认连续记账'),
            subtitle: Text(
              '新打开记账页时默认保留账户和日期，保存后继续下一笔',
              style: TextStyle(color: _mobileMuted),
            ),
            value: _continuous,
            onChanged: _loading
                ? null
                : (value) async {
                    setState(() => _continuous = value);
                    try {
                      await widget.controller.saveMobileSettings(
                        continuousEntry: value,
                      );
                    } catch (error) {
                      if (context.mounted) {
                        setState(() => _continuous = !value);
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(content: Text('连续记账设置失败：$error')),
                        );
                      }
                    }
                  },
          ),
          Text(
            '记账页仍可针对当前操作单独调整；金额动画会自动遵循系统“减少动态效果”设置。',
            style: TextStyle(color: _mobileMuted, height: 1.5),
          ),
        ],
      ),
    ),
  );
}

class _MobileAddTransactionPageState extends State<MobileAddTransactionPage> {
  final _title = TextEditingController();
  final _note = TextEditingController();
  final _tags = TextEditingController();
  final _discountAmount = TextEditingController();
  final _exchangeRate = TextEditingController();
  final _categorySearch = TextEditingController();
  final _entryPreferences = const MobileEntryPreferences();
  late String _type;
  String _amount = '0';
  String _originalCurrency = 'CNY';
  int _exchangeRateMicros = 1000000;
  int? _accountId;
  int? _toAccountId;
  String? _category;
  String _mood = '刚需';
  int? _splitMemberId;
  String _splitMode = '按比例平摊';
  double _mySharePercent = 50;
  DateTime _occurredAt = DateTime.now();
  bool _continuous = false;
  bool _hapticsEnabled = true;
  bool _accountManuallySelected = false;
  bool _reimbursable = false;
  bool _excludeFromBudget = false;
  List<String> _recentCategories = const [];
  bool _saving = false;

  static final _hardwareDigits = <LogicalKeyboardKey, String>{
    LogicalKeyboardKey.digit0: '0',
    LogicalKeyboardKey.digit1: '1',
    LogicalKeyboardKey.digit2: '2',
    LogicalKeyboardKey.digit3: '3',
    LogicalKeyboardKey.digit4: '4',
    LogicalKeyboardKey.digit5: '5',
    LogicalKeyboardKey.digit6: '6',
    LogicalKeyboardKey.digit7: '7',
    LogicalKeyboardKey.digit8: '8',
    LogicalKeyboardKey.digit9: '9',
    LogicalKeyboardKey.numpad0: '0',
    LogicalKeyboardKey.numpad1: '1',
    LogicalKeyboardKey.numpad2: '2',
    LogicalKeyboardKey.numpad3: '3',
    LogicalKeyboardKey.numpad4: '4',
    LogicalKeyboardKey.numpad5: '5',
    LogicalKeyboardKey.numpad6: '6',
    LogicalKeyboardKey.numpad7: '7',
    LogicalKeyboardKey.numpad8: '8',
    LogicalKeyboardKey.numpad9: '9',
  };

  LedgerController get controller => widget.controller;

  @override
  void initState() {
    super.initState();
    _type = const ['支出', '收入', '转账'].contains(widget.initialType)
        ? widget.initialType
        : '支出';
    _accountId = controller.activeAccounts.isEmpty
        ? null
        : controller.activeAccounts.first.id;
    _toAccountId = controller.activeAccounts.length < 2
        ? null
        : controller.activeAccounts[1].id;
    _originalCurrency = _accountCurrency;
    _exchangeRateMicros = _rateFor(_originalCurrency, _accountCurrency);
    _exchangeRate.text = _rateText;
    _category = _choices.isEmpty ? null : _choices.first.name;
    final draft = widget.initialDraft;
    if (draft != null) {
      _amount = draft.amount.toStringAsFixed(2);
      _title.text = draft.title;
      _occurredAt = (draft.occurredAt ?? DateTime.now()).toLocal();
      _category = _choices.any((choice) => choice.name == draft.category)
          ? draft.category
          : (_choices.isEmpty ? null : _choices.first.name);
    }
    _loadEntryPreferences();
  }

  @override
  void dispose() {
    _title.dispose();
    _note.dispose();
    _tags.dispose();
    _discountAmount.dispose();
    _exchangeRate.dispose();
    _categorySearch.dispose();
    super.dispose();
  }

  List<_MobileCategoryChoice> get _choices {
    final source = _type == '支出'
        ? controller.expenseCategories
        : controller.incomeCategories;
    if (source.isNotEmpty) {
      final byId = {for (final item in source) item.id: item};
      return source
          .where((item) => item.isActive)
          .map(
            (item) => _MobileCategoryChoice(
              name: item.name,
              icon: item.icon,
              color: _mobileHex(item.color),
              parentName: item.parentId == null
                  ? null
                  : byId[item.parentId]?.name,
            ),
          )
          .toList();
    }
    final fallback = _type == '支出'
        ? const [
            _MobileCategoryChoice(
              name: '餐饮',
              icon: '🍜',
              color: Color(0xffff9d61),
            ),
            _MobileCategoryChoice(
              name: '交通',
              icon: '🚕',
              color: Color(0xff78a9ff),
            ),
            _MobileCategoryChoice(
              name: '购物',
              icon: '🛍️',
              color: Color(0xffdb8dff),
            ),
            _MobileCategoryChoice(
              name: '日用',
              icon: '🏠',
              color: Color(0xff75d7bd),
            ),
            _MobileCategoryChoice(
              name: '娱乐',
              icon: '🎮',
              color: Color(0xffffcf70),
            ),
            _MobileCategoryChoice(
              name: '其它',
              icon: '🧾',
              color: Color(0xffaab2bf),
            ),
          ]
        : const [
            _MobileCategoryChoice(
              name: '工资',
              icon: '💼',
              color: Color(0xff65d89b),
            ),
            _MobileCategoryChoice(
              name: '奖金',
              icon: '🎁',
              color: Color(0xffffcf70),
            ),
            _MobileCategoryChoice(
              name: '其它收入',
              icon: '💰',
              color: Color(0xff78a9ff),
            ),
          ];
    return fallback;
  }

  List<_MobileCategoryChoice> get _visibleChoices {
    final query = _categorySearch.text.trim().toLowerCase();
    final choices = _choices
        .where(
          (item) =>
              query.isEmpty ||
              item.name.toLowerCase().contains(query) ||
              (item.parentName?.toLowerCase().contains(query) ?? false),
        )
        .toList();
    choices.sort((left, right) {
      final leftIndex = _recentCategories.indexOf(left.name);
      final rightIndex = _recentCategories.indexOf(right.name);
      if (leftIndex >= 0 || rightIndex >= 0) {
        if (leftIndex < 0) return 1;
        if (rightIndex < 0) return -1;
        return leftIndex.compareTo(rightIndex);
      }
      return 0;
    });
    return choices;
  }

  @override
  Widget build(BuildContext context) {
    final choices = _visibleChoices;
    final strings = AppLocalizations.of(context)!;
    final localizedType = switch (_type) {
      '收入' => strings.income,
      '转账' => strings.transfer,
      _ => strings.expense,
    };
    return Focus(
      autofocus: true,
      onKeyEvent: _handleHardwareKey,
      child: Scaffold(
        backgroundColor: _mobileBg,
        appBar: AppBar(
          title: Text(
            strings.entryTitle,
            style: const TextStyle(fontWeight: FontWeight.w800),
          ),
          leading: IconButton(
            tooltip: strings.closeEntry,
            onPressed: () => Navigator.pop(context),
            icon: const Icon(Icons.close_rounded),
          ),
        ),
        body: SafeArea(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(18, 8, 18, 24),
            children: [
              _TypeSwitch(
                value: _type,
                onChanged: (value) {
                  setState(() {
                    _type = value;
                    _category = _choices.isEmpty ? null : _choices.first.name;
                  });
                },
              ),
              const SizedBox(height: 18),
              _AmountDisplay(
                amount: _amount,
                type: _type,
                currency: _type == '转账' ? _accountCurrency : _originalCurrency,
              ),
              const SizedBox(height: 16),
              _Keypad(onKey: _inputKey),
              if (_type != '转账') ...[
                const SizedBox(height: 16),
                _MobileSelectRow(
                  icon: Icons.currency_exchange_rounded,
                  title: '原币种',
                  value: _originalCurrency,
                  onTap: _pickOriginalCurrency,
                ),
                if (_originalCurrency != _accountCurrency) ...[
                  const SizedBox(height: 8),
                  TextField(
                    controller: _exchangeRate,
                    keyboardType: const TextInputType.numberWithOptions(
                      decimal: true,
                    ),
                    onChanged: (value) {
                      final parsed = double.tryParse(value);
                      if (parsed != null && parsed > 0 && parsed <= 1000000) {
                        setState(
                          () =>
                              _exchangeRateMicros = (parsed * 1000000).round(),
                        );
                      }
                    },
                    decoration: InputDecoration(
                      prefixIcon: Icon(
                        Icons.sync_alt_rounded,
                        color: _mobileMuted,
                      ),
                      labelText: '1 $_originalCurrency = ? $_accountCurrency',
                      helperText:
                          '本位币金额：${_mobileMoney(_baseAmountCents)} $_accountCurrency',
                    ),
                  ),
                ],
              ],
              if (_type != '转账') ...[
                const SizedBox(height: 22),
                const _FormLabel(label: '分类'),
                const SizedBox(height: 10),
                TextField(
                  controller: _categorySearch,
                  onChanged: (_) => setState(() {}),
                  decoration: const InputDecoration(
                    prefixIcon: Icon(Icons.search_rounded),
                    hintText: '搜索分类',
                  ),
                ),
                const SizedBox(height: 10),
                GridView.builder(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  itemCount: choices.length,
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 4,
                    mainAxisSpacing: 12,
                    crossAxisSpacing: 10,
                    childAspectRatio: 1.05,
                  ),
                  itemBuilder: (context, index) {
                    final choice = choices[index];
                    return _CategoryChoice(
                      choice: choice,
                      selected: _category == choice.name,
                      onTap: () => _selectCategory(choice.name),
                    );
                  },
                ),
              ],
              const SizedBox(height: 18),
              _FormLabel(label: _type == '转账' ? '转账信息' : '账户与信息'),
              const SizedBox(height: 10),
              _MobileSelectRow(
                icon: Icons.account_balance_wallet_outlined,
                title: _type == '转账' ? '转出账户' : '账户',
                value: _accountName,
                onTap: () => _pickAccount(isDestination: false),
              ),
              if (_type == '转账') ...[
                const SizedBox(height: 8),
                _MobileSelectRow(
                  icon: Icons.move_down_rounded,
                  title: '转入账户',
                  value: _destinationAccountName,
                  onTap: () => _pickAccount(isDestination: true),
                ),
              ],
              const SizedBox(height: 8),
              _MobileSelectRow(
                icon: Icons.schedule_rounded,
                title: '日期时间',
                value: DateFormat('MM月dd日 HH:mm').format(_occurredAt),
                onTap: _pickDateTime,
              ),
              if (_type == '支出') ...[
                const SizedBox(height: 8),
                SegmentedButton<String>(
                  segments: const [
                    ButtonSegment(value: '刚需', label: Text('刚需')),
                    ButtonSegment(value: '悦己', label: Text('悦己')),
                    ButtonSegment(value: '冲动', label: Text('冲动')),
                  ],
                  selected: {_mood},
                  onSelectionChanged: (value) =>
                      setState(() => _mood = value.first),
                ),
                const SizedBox(height: 8),
                _MobileSelectRow(
                  icon: Icons.group_outlined,
                  title: '参与人 / 分账',
                  value: _splitMemberName,
                  onTap: _pickSplitMember,
                ),
                if (_splitMemberId != null) ...[
                  const SizedBox(height: 8),
                  DropdownButtonFormField<String>(
                    initialValue: _splitMode,
                    decoration: const InputDecoration(labelText: '分账方式'),
                    items: const [
                      DropdownMenuItem(value: '全额由我支付', child: Text('我先垫付全部')),
                      DropdownMenuItem(
                        value: '全额由对方支付',
                        child: Text('对方先垫付全部'),
                      ),
                      DropdownMenuItem(value: '按比例平摊', child: Text('按比例平摊')),
                    ],
                    onChanged: (value) =>
                        setState(() => _splitMode = value ?? '按比例平摊'),
                  ),
                  if (_splitMode == '按比例平摊') ...[
                    const SizedBox(height: 6),
                    Text(
                      '我承担 ${_mySharePercent.round()}%',
                      style: TextStyle(color: _mobileMuted),
                    ),
                    Slider(
                      value: _mySharePercent,
                      min: 0,
                      max: 100,
                      divisions: 20,
                      label: '${_mySharePercent.round()}%',
                      onChanged: (value) =>
                          setState(() => _mySharePercent = value),
                    ),
                  ],
                ],
              ],
              const SizedBox(height: 8),
              if (_type != '转账') ...[
                TextField(
                  key: const ValueKey('mobile-entry-title'),
                  controller: _title,
                  textInputAction: TextInputAction.next,
                  decoration: InputDecoration(
                    prefixIcon: Icon(
                      Icons.storefront_outlined,
                      color: _mobileMuted,
                    ),
                    labelText: '商户 / 项目',
                    hintText: '例如：午餐、地铁、工资',
                  ),
                ),
                const SizedBox(height: 8),
              ],
              TextField(
                controller: _note,
                textInputAction: TextInputAction.done,
                decoration: InputDecoration(
                  prefixIcon: Icon(Icons.notes_rounded, color: _mobileMuted),
                  hintText: '添加备注，例如：午餐、地铁、房租…',
                ),
              ),
              if (_type != '转账') ...[
                const SizedBox(height: 8),
                TextField(
                  controller: _tags,
                  textInputAction: TextInputAction.next,
                  decoration: InputDecoration(
                    prefixIcon: Icon(
                      Icons.label_outline_rounded,
                      color: _mobileMuted,
                    ),
                    labelText: '标签（可选）',
                    hintText: '多个标签用逗号分隔，例如：工作、报销',
                  ),
                ),
                const SizedBox(height: 8),
                TextField(
                  controller: _discountAmount,
                  keyboardType: const TextInputType.numberWithOptions(
                    decimal: true,
                  ),
                  decoration: InputDecoration(
                    prefixIcon: Icon(
                      Icons.local_offer_outlined,
                      color: _mobileMuted,
                    ),
                    labelText: '优惠金额（可选）',
                    prefixText: '¥ ',
                  ),
                ),
                SwitchListTile.adaptive(
                  contentPadding: const EdgeInsets.symmetric(horizontal: 4),
                  title: const Text('待报销'),
                  subtitle: Text(
                    '保留在报销清单中，不改变实际流水金额',
                    style: TextStyle(color: _mobileMuted, fontSize: 12),
                  ),
                  value: _reimbursable,
                  activeTrackColor: _mobileBrand,
                  onChanged: (value) => setState(() => _reimbursable = value),
                ),
                SwitchListTile.adaptive(
                  contentPadding: const EdgeInsets.symmetric(horizontal: 4),
                  title: const Text('不计入预算'),
                  subtitle: Text(
                    '仍保留在账单中，但不参与预算统计',
                    style: TextStyle(color: _mobileMuted, fontSize: 12),
                  ),
                  value: _excludeFromBudget,
                  activeTrackColor: _mobileBrand,
                  onChanged: (value) =>
                      setState(() => _excludeFromBudget = value),
                ),
              ],
              const SizedBox(height: 8),
              SwitchListTile.adaptive(
                contentPadding: const EdgeInsets.symmetric(horizontal: 4),
                title: const Text('连续记账'),
                subtitle: Text(
                  '保存后保留账户与日期，继续输入下一笔',
                  style: TextStyle(color: _mobileMuted, fontSize: 12),
                ),
                value: _continuous,
                activeTrackColor: _mobileBrand,
                onChanged: (value) => setState(() => _continuous = value),
              ),
            ],
          ),
        ),
        bottomNavigationBar: SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(18, 8, 18, 12),
            child: SizedBox(
              height: 54,
              child: FilledButton(
                key: const ValueKey('mobile-entry-save'),
                onPressed: _saving ? null : _save,
                style: FilledButton.styleFrom(
                  backgroundColor: _type == '支出'
                      ? _mobileExpense
                      : _type == '收入'
                      ? _mobileIncome
                      : _mobilePurple,
                  foregroundColor: _mobileOnBrand,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(18),
                  ),
                ),
                child: _saving
                    ? const CircularProgressIndicator(strokeWidth: 2)
                    : Text(
                        '${strings.saveEntry}$localizedType ${_mobileMoney(_baseAmountCents)} $_accountCurrency',
                        style: const TextStyle(fontWeight: FontWeight.w800),
                      ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  KeyEventResult _handleHardwareKey(FocusNode node, KeyEvent event) {
    if (event is! KeyDownEvent || _textEditorHasFocus) {
      return KeyEventResult.ignored;
    }
    final key = event.logicalKey;
    final digit = _hardwareDigits[key];
    if (digit != null) {
      _inputKey(digit, haptic: false);
      return KeyEventResult.handled;
    }
    switch (key) {
      case LogicalKeyboardKey.backspace:
        _inputKey('⌫', haptic: false);
        return KeyEventResult.handled;
      case LogicalKeyboardKey.delete:
        _inputKey('清空', haptic: false);
        return KeyEventResult.handled;
      case LogicalKeyboardKey.period:
      case LogicalKeyboardKey.numpadDecimal:
        _inputKey('.', haptic: false);
        return KeyEventResult.handled;
      case LogicalKeyboardKey.add:
      case LogicalKeyboardKey.numpadAdd:
        _inputKey('+', haptic: false);
        return KeyEventResult.handled;
      case LogicalKeyboardKey.minus:
      case LogicalKeyboardKey.numpadSubtract:
        _inputKey('-', haptic: false);
        return KeyEventResult.handled;
      case LogicalKeyboardKey.enter:
      case LogicalKeyboardKey.numpadEnter:
        unawaited(_save());
        return KeyEventResult.handled;
      case LogicalKeyboardKey.escape:
        Navigator.maybePop(context);
        return KeyEventResult.handled;
      default:
        return KeyEventResult.ignored;
    }
  }

  bool get _textEditorHasFocus {
    var focus = FocusManager.instance.primaryFocus;
    while (focus != null) {
      final context = focus.context;
      if (context?.widget is EditableText ||
          context?.findAncestorWidgetOfExactType<EditableText>() != null) {
        return true;
      }
      focus = focus.parent;
    }
    return false;
  }

  String get _accountName {
    for (final account in controller.activeAccounts) {
      if (account.id == _accountId) return '${account.icon}  ${account.name}';
    }
    return controller.activeAccounts.isEmpty
        ? '暂无账户'
        : '${controller.activeAccounts.first.icon}  ${controller.activeAccounts.first.name}';
  }

  String get _accountCurrency {
    for (final account in controller.activeAccounts) {
      if (account.id == _accountId) return account.currency;
    }
    return controller.activeAccounts.isEmpty
        ? 'CNY'
        : controller.activeAccounts.first.currency;
  }

  String get _rateText => (_exchangeRateMicros / 1000000)
      .toStringAsFixed(6)
      .replaceFirst(RegExp(r'0+$'), '')
      .replaceFirst(RegExp(r'\.$'), '');

  int _rateFor(String original, String account) {
    if (original == account) return 1000000;
    final rates = controller.exchangeRates?.rates;
    final from = rates?[original];
    final to = rates?[account];
    if (from == null || to == null || to <= 0) return 1000000;
    return (from / to * 1000000).round();
  }

  String get _destinationAccountName {
    for (final account in controller.activeAccounts) {
      if (account.id == _toAccountId) {
        return '${account.icon}  ${account.name}';
      }
    }
    return '请选择转入账户';
  }

  String get _splitMemberName {
    if (_splitMemberId == null) return '不分账';
    for (final member in controller.members) {
      if (member.id == _splitMemberId) return '${member.icon}  ${member.name}';
    }
    return '不分账';
  }

  int get _amountCents => AmountExpression.evaluateCents(_amount) ?? 0;

  int get _baseAmountCents {
    if (_type == '转账' || _originalCurrency == _accountCurrency) {
      return _amountCents;
    }
    return (_amountCents * _exchangeRateMicros / 1000000).round();
  }

  void _inputKey(String key, {bool haptic = true}) {
    if (haptic && _hapticsEnabled) HapticFeedback.selectionClick();
    setState(() {
      if (key == '⌫') {
        if (_amount.length <= 1) {
          _amount = '0';
        } else {
          _amount = _amount.substring(0, _amount.length - 1);
        }
      } else if (key == '清空') {
        _amount = '0';
      } else if (!AmountExpression.canAppend(_amount, key)) {
        return;
      } else if (_amount == '0' && key != '.') {
        _amount = key;
      } else {
        _amount += key;
      }
    });
  }

  Future<void> _pickAccount({required bool isDestination}) async {
    if (controller.activeAccounts.isEmpty) return;
    final id = await showModalBottomSheet<int>(
      context: context,
      backgroundColor: _mobileSurface,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: controller.activeAccounts
              .map(
                (account) => ListTile(
                  leading: Text(
                    account.icon,
                    style: const TextStyle(fontSize: 24),
                  ),
                  title: Text(account.name),
                  subtitle: Text(
                    '${controller.preferences.hideAmounts ? '••••' : _mobileMoney(account.balanceCents)} · ${account.currency} · ${account.type}',
                    style: TextStyle(color: _mobileMuted),
                  ),
                  trailing:
                      account.id == (isDestination ? _toAccountId : _accountId)
                      ? Icon(Icons.check_rounded, color: _mobileBrand)
                      : null,
                  onTap: () => Navigator.pop(context, account.id),
                ),
              )
              .toList(),
        ),
      ),
    );
    if (id != null) {
      setState(() {
        if (isDestination) {
          _toAccountId = id;
        } else {
          _accountId = id;
          _accountManuallySelected = true;
          _originalCurrency = controller.activeAccounts
              .firstWhere((account) => account.id == id)
              .currency;
          _exchangeRateMicros = _rateFor(_originalCurrency, _accountCurrency);
          _exchangeRate.text = _rateText;
        }
      });
    }
  }

  Future<void> _pickDateTime() async {
    final now = DateTime.now();
    final selected = await showModalBottomSheet<DateTime>(
      context: context,
      backgroundColor: _mobileSurface,
      showDragHandle: true,
      builder: (sheetContext) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (final offset in [0, 1, 2])
              ListTile(
                leading: const Icon(Icons.calendar_today_outlined),
                title: Text(
                  offset == 0
                      ? '今天'
                      : offset == 1
                      ? '昨天'
                      : '前天',
                ),
                subtitle: Text(
                  DateFormat('yyyy年MM月dd日')
                      .format(now.subtract(Duration(days: offset))),
                ),
                onTap: () {
                  final day = now.subtract(Duration(days: offset));
                  Navigator.pop(
                    sheetContext,
                    DateTime(
                      day.year,
                      day.month,
                      day.day,
                      _occurredAt.hour,
                      _occurredAt.minute,
                    ),
                  );
                },
              ),
            ListTile(
              leading: const Icon(Icons.edit_calendar_outlined),
              title: const Text('选择其他日期'),
              onTap: () async {
                final navigator = Navigator.of(sheetContext);
                final day = await showDatePicker(
                  context: sheetContext,
                  initialDate: _occurredAt,
                  firstDate: DateTime(2000),
                  lastDate: now.add(const Duration(days: 365)),
                );
                if (day != null) {
                  navigator.pop(
                    DateTime(
                      day.year,
                      day.month,
                      day.day,
                      _occurredAt.hour,
                      _occurredAt.minute,
                    ),
                  );
                }
              },
            ),
          ],
        ),
      ),
    );
    if (selected == null || !mounted) return;
    final time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(_occurredAt),
    );
    if (!mounted) return;
    setState(() {
      _occurredAt = DateTime(
        selected.year,
        selected.month,
        selected.day,
        time?.hour ?? selected.hour,
        time?.minute ?? selected.minute,
      );
    });
  }

  Future<void> _loadEntryPreferences() async {
    final recent = await _entryPreferences.recentCategories();
    if (mounted) {
      setState(() {
        _recentCategories = recent;
        _hapticsEnabled = controller.preferences.hapticsEnabled;
        _continuous = controller.preferences.continuousEntry;
      });
      if (widget.initialDraft == null) {
        await _restoreEntryDraftIfPresent();
      }
    }
  }

  Future<void> _restoreEntryDraftIfPresent() async {
    final draft = await _entryPreferences.entryDraft();
    if (!mounted || draft == null) return;
    final restore = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('恢复未完成记账'),
        content: const Text('上次保存失败，是否恢复刚才填写的内容？'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('放弃'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('恢复'),
          ),
        ],
      ),
    );
    if (!mounted) return;
    if (restore == true) {
      _applyEntryDraft(draft);
    } else {
      await _entryPreferences.clearEntryDraft();
    }
  }

  Future<void> _pickOriginalCurrency() async {
    final selected = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      backgroundColor: _mobileSurface,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: _supportedMobileCurrencies
              .map(
                (currency) => ListTile(
                  leading: const Icon(Icons.currency_exchange_rounded),
                  title: Text(currency),
                  trailing: currency == _originalCurrency
                      ? Icon(Icons.check_rounded, color: _mobileBrand)
                      : null,
                  onTap: () => Navigator.pop(context, currency),
                ),
              )
              .toList(),
        ),
      ),
    );
    if (selected == null || !mounted) return;
    setState(() {
      _originalCurrency = selected;
      _exchangeRateMicros = _rateFor(selected, _accountCurrency);
      _exchangeRate.text = _rateText;
    });
  }

  void _applyEntryDraft(Map<String, dynamic> draft) {
    final draftType = _draftString(draft['type']);
    final draftOccurredAt = DateTime.tryParse(
      _draftString(draft['occurredAt']) ?? '',
    );
    final accountId = _draftInt(draft['accountId']);
    final toAccountId = _draftInt(draft['toAccountId']);
    final splitMemberId = _draftInt(draft['splitMemberId']);
    final draftCategory = _draftString(draft['category']);
    setState(() {
      if (draftType != null && const ['支出', '收入', '转账'].contains(draftType)) {
        _type = draftType;
      }
      _amount = _draftString(draft['amount']) ?? '0';
      _title.text = _draftString(draft['title']) ?? '';
      _note.text = _draftString(draft['note']) ?? '';
      _tags.text = _draftString(draft['tags']) ?? '';
      _discountAmount.text = _draftString(draft['discountAmount']) ?? '';
      final originalCurrency = _draftString(draft['originalCurrency']);
      if (originalCurrency != null &&
          _supportedMobileCurrencies.contains(originalCurrency)) {
        _originalCurrency = originalCurrency;
      }
      _exchangeRateMicros =
          (draft['exchangeRateMicros'] as num?)?.toInt() ??
          _rateFor(_originalCurrency, _accountCurrency);
      _exchangeRate.text = _rateText;
      _mood = _draftString(draft['mood']) ?? '刚需';
      _splitMode = _draftString(draft['splitMode']) ?? '按比例平摊';
      _mySharePercent = (draft['mySharePercent'] as num?)?.toDouble() ?? 50;
      _reimbursable = draft['reimbursable'] == true;
      _excludeFromBudget = draft['excludeFromBudget'] == true;
      if (draftOccurredAt != null) _occurredAt = draftOccurredAt.toLocal();
      if (draftCategory != null &&
          _choices.any((choice) => choice.name == draftCategory)) {
        _category = draftCategory;
      } else {
        _category = _choices.isEmpty ? null : _choices.first.name;
      }
      if (accountId != null &&
          controller.activeAccounts.any((account) => account.id == accountId)) {
        _accountId = accountId;
      }
      if (toAccountId != null &&
          controller.activeAccounts.any(
            (account) => account.id == toAccountId,
          )) {
        _toAccountId = toAccountId;
      }
      if (splitMemberId != null &&
          controller.members.any((member) => member.id == splitMemberId)) {
        _splitMemberId = splitMemberId;
      }
    });
  }

  String? _draftString(Object? value) => value is String ? value : null;

  int? _draftInt(Object? value) {
    if (value is int) return value;
    if (value is num) return value.toInt();
    return int.tryParse('$value');
  }

  Map<String, dynamic> _entryDraft() => {
    'type': _type,
    'amount': _amount,
    'title': _title.text,
    'note': _note.text,
    'tags': _tags.text,
    'discountAmount': _discountAmount.text,
    'originalCurrency': _originalCurrency,
    'exchangeRateMicros': _exchangeRateMicros,
    'accountId': _accountId,
    'toAccountId': _toAccountId,
    'category': _category,
    'mood': _mood,
    'splitMemberId': _splitMemberId,
    'splitMode': _splitMode,
    'mySharePercent': _mySharePercent,
    'occurredAt': _occurredAt.toIso8601String(),
    'reimbursable': _reimbursable,
    'excludeFromBudget': _excludeFromBudget,
  };

  Future<void> _selectCategory(String category) async {
    setState(() => _category = category);
    if (_accountManuallySelected) return;
    final accountId = await _entryPreferences.accountForCategory(category);
    if (!mounted || accountId == null) return;
    if (controller.activeAccounts.any((account) => account.id == accountId)) {
      setState(() => _accountId = accountId);
    }
  }

  Future<void> _pickSplitMember() async {
    final partners = controller.members
        .where((member) => !member.isMe)
        .toList();
    final selected = await showModalBottomSheet<int?>(
      context: context,
      showDragHandle: true,
      backgroundColor: _mobileSurface,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.person_off_outlined),
              title: const Text('不分账'),
              onTap: () => Navigator.pop(context, -1),
            ),
            for (final member in partners)
              ListTile(
                leading: Text(
                  member.icon,
                  style: const TextStyle(fontSize: 22),
                ),
                title: Text(member.name),
                trailing: member.id == _splitMemberId
                    ? Icon(Icons.check_rounded, color: _mobileBrand)
                    : null,
                onTap: () => Navigator.pop(context, member.id),
              ),
            if (partners.isEmpty)
              Padding(
                padding: EdgeInsets.all(20),
                child: Text(
                  '请先在分账管理中添加参与人',
                  style: TextStyle(color: _mobileMuted),
                ),
              ),
          ],
        ),
      ),
    );
    if (selected != null && mounted) {
      setState(() => _splitMemberId = selected == -1 ? null : selected);
    }
  }

  Future<void> _save() async {
    final cents = AmountExpression.evaluateCents(_amount);
    final amount = cents == null ? 0.0 : cents / 100;
    if (amount <= 0 ||
        (_type != '转账' && _category == null) ||
        (_type != '转账' && _baseAmountCents <= 0)) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('请输入金额并选择分类')));
      return;
    }
    setState(() => _saving = true);
    try {
      if (_type == '转账') {
        if (_accountId == null || _toAccountId == null) {
          throw const ApiException('请选择转出和转入账户');
        }
        await controller.transfer(
          kind: '账户转账',
          fromAccountId: _accountId!,
          toAccountId: _toAccountId!,
          amount: amount,
          note: _note.text.trim().isEmpty ? null : _note.text.trim(),
          occurredAt: _occurredAt,
        );
      } else {
        final parsedTags = _tags.text
            .split(RegExp(r'[,，]'))
            .map((tag) => tag.trim())
            .where((tag) => tag.isNotEmpty)
            .toSet()
            .take(12)
            .toList();
        final parsedDiscount =
            double.tryParse(_discountAmount.text.trim()) ?? 0;
        if (parsedDiscount < 0 || !parsedDiscount.isFinite) {
          throw const ApiException('优惠金额格式无效');
        }
        await controller.addEntry(
          amount: _baseAmountCents / 100,
          title: _title.text.trim().isEmpty ? _category! : _title.text.trim(),
          category: _category!,
          type: _type,
          accountId: _accountId,
          occurredAt: _occurredAt.toUtc().toIso8601String(),
          mood: _type == '支出' ? _mood : null,
          note: _note.text.trim().isEmpty ? null : _note.text.trim(),
          tags: parsedTags,
          reimbursable: _reimbursable,
          discountAmountCents: (parsedDiscount * 100).round(),
          excludeFromBudget: _excludeFromBudget,
          originalAmountCents: _amountCents,
          originalCurrency: _originalCurrency,
          exchangeRateMicros: _exchangeRateMicros,
          splitWithMemberId: _type == '支出' ? _splitMemberId : null,
          splitMode: _type == '支出' && _splitMemberId != null
              ? _splitMode
              : null,
          mySharePercent: _splitMode == '按比例平摊' ? _mySharePercent : 100,
          source: widget.initialDraft?.source ?? '移动端记账',
          recognitionText: widget.initialDraft?.recognitionText,
          recognitionCompleteness: widget.initialDraft?.recognitionCompleteness,
          recognitionCorrections: _screenshotRecognitionCorrections(),
        );
      }
      if (!mounted) return;
      try {
        await _entryPreferences.clearEntryDraft();
      } catch (_) {
        // Local draft cleanup must not turn a successful save into an error.
      }
      if (_type != '转账' && _accountId != null && _category != null) {
        try {
          await _entryPreferences.remember(
            category: _category!,
            accountId: _accountId!,
          );
        } catch (_) {
          // 本地偏好失败不能把已经成功写入的账单误报为失败。
        }
      }
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('已保存，账本已同步')));
      if (_continuous && _type != '转账') {
        setState(() {
          _amount = '0';
          _title.clear();
          _note.clear();
          _tags.clear();
          _discountAmount.clear();
          _reimbursable = false;
          _excludeFromBudget = false;
        });
      } else {
        Navigator.pop(context);
      }
    } catch (error) {
      try {
        await _entryPreferences.saveEntryDraft(_entryDraft());
      } catch (_) {
        // A draft is best effort; retain the original save error for the user.
      }
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('$error；已保留本次填写内容')));
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Map<String, dynamic> _screenshotRecognitionCorrections() {
    final draft = widget.initialDraft;
    if (draft?.source != '截图本地识别') return const {};
    final recognized = draft!.recognizedFields;
    final corrections = <String, Map<String, dynamic>>{};
    void record(String field, Object? before, Object after) {
      if (before == null || '$before'.trim() == '$after'.trim()) return;
      corrections[field] = {'recognized': before, 'confirmed': after};
    }

    final amount = recognized['amount'];
    if (amount is num) record('amount', amount, _baseAmountCents / 100);
    record(
      'title',
      recognized['title'],
      _title.text.trim().isEmpty ? _category! : _title.text.trim(),
    );
    record('type', recognized['type'], _type);
    final originalDate = DateTime.tryParse('${recognized['occurredAt'] ?? ''}');
    if (originalDate != null &&
        (originalDate.year != _occurredAt.year ||
            originalDate.month != _occurredAt.month ||
            originalDate.day != _occurredAt.day)) {
      record(
        'occurredAt',
        originalDate.toIso8601String(),
        _occurredAt.toIso8601String(),
      );
    }
    return corrections;
  }
}
