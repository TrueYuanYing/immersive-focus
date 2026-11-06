import 'package:flutter/material.dart';

import 'scene_packs.dart';
import 'scene_resource_gate.dart';
import 'study_scene_screen.dart';

/// A full-screen route, created only when the user opens focus.
/// The existing scene owns saving and disposal when this route is popped.
class CafeFocusScreen extends StatefulWidget {
  const CafeFocusScreen({super.key});

  static bool _opening = false;

  static Future<void> open(BuildContext context) async {
    if (_opening) return;
    _opening = true;
    try {
      await Navigator.of(context).push<void>(
          MaterialPageRoute(builder: (_) => const CafeFocusScreen()));
    } finally {
      _opening = false;
    }
  }

  @override
  State<CafeFocusScreen> createState() => _CafeFocusScreenState();
}

class _CafeFocusScreenState extends State<CafeFocusScreen> {
  late Future<ScenePack> _pack = _loadPack();

  Future<ScenePack> _loadPack() async =>
      (await ScenePacks.catalog()).singleWhere((pack) => pack.id == 'mado');

  @override
  Widget build(BuildContext context) => FutureBuilder<ScenePack>(
        future: _pack,
        builder: (context, snapshot) {
          if (snapshot.hasData) {
            return SceneResourceGate(
                id: 'focus-mado',
                title: '窗间 MADO',
                builder: (_) =>
                    StudySceneScreen(pack: snapshot.data!, title: '窗间 · MADO'));
          }
          return Scaffold(
            appBar: AppBar(title: const Text('窗间 · MADO')),
            body: Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(mainAxisSize: MainAxisSize.min, children: [
                  if (snapshot.hasError) ...[
                    const Text('咖啡馆暂未打开，请重试。'),
                    const SizedBox(height: 16),
                    FilledButton(
                        onPressed: () => setState(() => _pack = _loadPack()),
                        child: const Text('重新打开')),
                  ] else ...[
                    const CircularProgressIndicator(),
                    const SizedBox(height: 16),
                    const Text('正在打开窗间 MADO…'),
                  ],
                ]),
              ),
            ),
          );
        },
      );
}
