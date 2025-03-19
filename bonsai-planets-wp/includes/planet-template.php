<?php
/**
 * Template for the planet shortcode
 * 
 * @var string $id The unique identifier for the planet container
 * @var string $width The width of the planet container
 * @var string $height The height of the planet container
 */

// Ensure variables are defined
$id = $id ?? 'bonsai-planet-' . uniqid();
$width = $width ?? '100%';
$height = $height ?? '500px';
?>
<div id="planet-container-<?php echo esc_attr($id); ?>" class="planet-container" style="position: relative; width: <?php echo esc_attr($width); ?>; height: <?php echo esc_attr($height); ?>;">
    <canvas id="planet-canvas-<?php echo esc_attr($id); ?>" style="width: 100%; height: 100%;"></canvas>
    
    <div class="planet-controls" style="position: absolute; top: 10px; left: 10px; color: white; font-family: Arial, sans-serif; padding: 10px; background-color: rgba(0,0,0,0.5); border-radius: 5px;">
        <h3 style="margin: 0 0 10px 0;">Planet Controls</h3>
        <button class="bonsai-planet-btn" data-planet-type="beach" style="margin: 5px; padding: 8px 16px; background-color: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer;">Beach Planet</button>
        <button class="bonsai-planet-btn" data-planet-type="forest" style="margin: 5px; padding: 8px 16px; background-color: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer;">Forest Planet</button>
        <button class="bonsai-planet-btn" data-planet-type="snowForest" style="margin: 5px; padding: 8px 16px; background-color: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer;">Snow Forest Planet</button>
        <button class="bonsai-planet-btn" data-planet-type="random" style="margin: 5px; padding: 8px 16px; background-color: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer;">Random Planet</button>
    </div>
    
    <div class="planet-instructions" style="position: absolute; bottom: 10px; left: 10px; color: white; font-family: Arial, sans-serif; padding: 10px; background-color: rgba(0,0,0,0.5); border-radius: 5px; max-width: 300px;">
        <h3 style="margin: 0 0 10px 0;">Ball Controls</h3>
        <p style="margin: 5px 0;">WASD or Arrow Keys: Roll the ball (relative to camera view)</p>
        <p style="margin: 5px 0;">Space: Jump (ball jumps away from planet)</p>
        <p style="margin: 5px 0;">Mouse Wheel: Zoom in/out (closer = 10% size & micro-movement, farther = 200% size & faster)</p>
        <p style="margin: 5px 0;">Click and Drag: Change camera angle around the ball</p>
        <p style="margin: 5px 0;">R: Toggle planet auto-rotation</p>
        <p style="margin: 5px 0;">1, 2, 3: Switch planet type</p>
        <p style="margin: 5px 0;">Ctrl+D: Toggle debug ray visualization</p>
        <p style="margin: 5px 0;"><strong>New Features:</strong> Microscopic zoom level for extreme close-ups!</p>
    </div>
</div>

<script type="module">
    document.addEventListener('DOMContentLoaded', function() {
        const container = document.getElementById('planet-container-<?php echo esc_attr($id); ?>');
        const canvas = document.getElementById('planet-canvas-<?php echo esc_attr($id); ?>');
        
        if (!container || !canvas) {
            console.error('Planet container or canvas not found');
            return;
        }

        // Initialize the planet with the full game features
        try {
            // Make canvas the active element to enable keyboard controls
            canvas.tabIndex = 1;
            canvas.focus();
            
            // Import the main bundle and initialize with full game features
            const { initBonsaiPlanet } = await import('<?php echo esc_url(plugin_dir_url(__FILE__) . '../assets/js/main-bundle.js'); ?>');
            initBonsaiPlanet(canvas.id, {
                gameMode: true, // Enable full game features
                width: container.clientWidth,
                height: container.clientHeight,
                id: '<?php echo esc_attr($id); ?>'
            });
            
            // Focus canvas when container is clicked
            container.addEventListener('click', function() {
                canvas.focus();
            });
        } catch (error) {
            console.error('Failed to initialize planet:', error);
        }
    });
</script> 