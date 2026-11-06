import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'dart:async';
import 'package:flutter/services.dart';
import '../../services/resources/resource_packages.dart';
import '../settings/storage_resources_screen.dart';

/// Mount the scene only after its pinned resources are ready. Saves are independent.
class SceneResourceGate extends ConsumerStatefulWidget {
  const SceneResourceGate(
      {super.key,
      required this.id,
      required this.title,
      required this.builder});
  final String id, title;
  final WidgetBuilder builder;
  @override
  ConsumerState<SceneResourceGate> createState() => _SceneResourceGateState();
}

class _SceneResourceGateState extends ConsumerState<SceneResourceGate> {
  Future<void>? _lease;
  static int _nextOwner = 0;
  final String _owner =
      'scene_${DateTime.now().microsecondsSinceEpoch}_${++_nextOwner}';
  static const _channel = MethodChannel('com.iko.study/resource_packs');
  Future<void> _acquire() async {
    await _channel.invokeMethod<dynamic>(
        'acquireScene', {'id': widget.id, 'owner': _owner});
  }

  @override
  void dispose() {
    final lease = _lease;
    if (lease != null) {
      unawaited(lease
          .then((_) => _channel.invokeMethod<void>(
              'releaseScene', {'id': widget.id, 'owner': _owner}))
          .catchError((_) {}));
    }
    super.dispose();
  }

  @override
  void initState() {
    super.initState();
    Future.microtask(() => ref.read(resourcePackagesProvider).refresh());
  }

  @override
  Widget build(BuildContext context) {
    final resources = ref.watch(resourcePackagesProvider),
        pack = resources[widget.id];
    if (pack?.installed == true) {
      return FutureBuilder<void>(
          future: _lease ??= _acquire(),
          builder: (context, snapshot) {
            if (snapshot.connectionState == ConnectionState.done &&
                !snapshot.hasError) {
              return widget.builder(context);
            }
            return Scaffold(
                appBar: AppBar(title: Text(widget.title)),
                body: Center(
                    child: snapshot.hasError
                        ? TextButton(
                            onPressed: () => setState(() => _lease = null),
                            child: const Text('资源暂时正在使用，点此重试'))
                        : const CircularProgressIndicator()));
          });
    }
    return Scaffold(
        appBar: AppBar(title: Text(widget.title)),
        body: Center(
            child: SingleChildScrollView(
                child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 540),
                    child: Padding(
                        padding: const EdgeInsets.all(24),
                        child:
                            Column(mainAxisSize: MainAxisSize.min, children: [
                          const Icon(Icons.landscape_outlined, size: 40),
                          const SizedBox(height: 16),
                          Text('安装${widget.title}',
                              style: Theme.of(context).textTheme.headlineSmall),
                          const SizedBox(height: 10),
                          const Text('首次安装后即可离线进入。移除场景资源会保留你的专注存档。',
                              textAlign: TextAlign.center),
                          const SizedBox(height: 24),
                          if (pack != null)
                            ResourcePackageTile(pack: pack, highlighted: true)
                          else if (resources.error != null) ...[
                            Text(resources.error!),
                            TextButton(
                                onPressed: resources.refresh,
                                child: const Text('重试'))
                          ] else
                            const CircularProgressIndicator(),
                        ]))))));
  }
}
