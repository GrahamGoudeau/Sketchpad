package main

import (
	"fmt"
	"image"
	"image/jpeg"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
)

type point struct {
	x float64
	y float64
}

type frameChange struct {
	frame      int
	changed    int
	cursorJump float64
}

func main() {
	if len(os.Args) != 2 {
		fmt.Fprintln(os.Stderr, "usage: visual-log-analyzer VIDEO_OR_FRAME_DIRECTORY")
		os.Exit(2)
	}
	paths, cleanup, err := framePaths(os.Args[1])
	if err != nil {
		panic(err)
	}
	defer cleanup()
	var previous *point
	var previousImage image.Image
	changes := make([]frameChange, 0, len(paths))
	fmt.Println("CURSOR JUMPS")
	for index, path := range paths {
		currentImage := decode(path)
		cursor, ok := cyanCursor(currentImage)
		if !ok {
			previousImage = currentImage
			continue
		}
		jump := 0.0
		if previous != nil {
			jump = math.Hypot(cursor.x-previous.x, cursor.y-previous.y)
		}
		if previous == nil || jump >= 8 {
			fmt.Printf("frame=%04d cursor=(%.1f,%.1f) jump=%.1f\n", index+1, cursor.x, cursor.y, jump)
		}
		if previousImage != nil {
			changes = append(changes, frameChange{
				frame:      index + 1,
				changed:    changedPixels(previousImage, currentImage, previous, cursor),
				cursorJump: jump,
			})
		}
		cursorCopy := cursor
		previous = &cursorCopy
		previousImage = currentImage
	}
	sort.Slice(changes, func(left, right int) bool {
		return changes[left].changed > changes[right].changed
	})
	fmt.Println("\nLARGEST DISPLAY CHANGES")
	printed := 0
	for _, change := range changes {
		if change.frame < 120 {
			continue
		}
		fmt.Printf("frame=%04d changed=%d cursor-jump=%.1f\n",
			change.frame, change.changed, change.cursorJump)
		printed++
		if printed == 30 {
			break
		}
	}
}

func framePaths(input string) ([]string, func(), error) {
	info, err := os.Stat(input)
	if err != nil {
		return nil, func() {}, err
	}
	directory := input
	cleanup := func() {}
	if !info.IsDir() {
		directory, err = os.MkdirTemp("", "sketchpad-visual-log-")
		if err != nil {
			return nil, cleanup, err
		}
		cleanup = func() { _ = os.RemoveAll(directory) }
		output := filepath.Join(directory, "native-%04d.jpg")
		command := exec.Command("ffmpeg", "-hide_banner", "-loglevel", "error", "-i", input, "-fps_mode", "passthrough", output)
		if outputBytes, commandErr := command.CombinedOutput(); commandErr != nil {
			cleanup()
			return nil, func() {}, fmt.Errorf("extract frames: %w: %s", commandErr, outputBytes)
		}
	}
	paths, err := filepath.Glob(filepath.Join(directory, "native-*.jpg"))
	if err != nil {
		cleanup()
		return nil, func() {}, err
	}
	sort.Strings(paths)
	if len(paths) == 0 {
		cleanup()
		return nil, func() {}, fmt.Errorf("no native-*.jpg frames found in %s", directory)
	}
	return paths, cleanup, nil
}

func decode(path string) image.Image {
	file, err := os.Open(path)
	if err != nil {
		panic(err)
	}
	defer file.Close()
	decoded, err := jpeg.Decode(file)
	if err != nil {
		panic(err)
	}
	return decoded
}

func cyanCursor(frame image.Image) (point, bool) {
	bounds := frame.Bounds()
	minimumX, minimumY := bounds.Max.X, bounds.Max.Y
	maximumX, maximumY := bounds.Min.X, bounds.Min.Y
	count := 0
	for y := bounds.Min.Y; y < bounds.Max.Y-40; y++ {
		for x := bounds.Min.X; x < bounds.Max.X; x++ {
			r16, g16, b16, _ := frame.At(x, y).RGBA()
			r, g, b := r16>>8, g16>>8, b16>>8
			if !isCyan(r, g, b) {
				continue
			}
			minimumX = min(minimumX, x)
			minimumY = min(minimumY, y)
			maximumX = max(maximumX, x)
			maximumY = max(maximumY, y)
			count++
		}
	}
	if count < 3 {
		return point{}, false
	}
	return point{
		x: float64(minimumX+maximumX) / 2,
		y: float64(minimumY+maximumY) / 2,
	}, true
}

func changedPixels(previous, current image.Image, previousCursor *point, currentCursor point) int {
	bounds := current.Bounds()
	changed := 0
	for y := bounds.Min.Y; y < bounds.Max.Y-40; y++ {
		for x := bounds.Min.X; x < bounds.Max.X; x++ {
			if near(point{x: float64(x), y: float64(y)}, currentCursor, 80) ||
				(previousCursor != nil && near(point{x: float64(x), y: float64(y)}, *previousCursor, 80)) {
				continue
			}
			previousR, previousG, previousB, _ := previous.At(x, y).RGBA()
			currentR, currentG, currentB, _ := current.At(x, y).RGBA()
			if isCyan(previousR>>8, previousG>>8, previousB>>8) ||
				isCyan(currentR>>8, currentG>>8, currentB>>8) {
				continue
			}
			previousLight := int(previousG >> 8)
			currentLight := int(currentG >> 8)
			if abs(previousLight-currentLight) >= 24 {
				changed++
			}
		}
	}
	return changed
}

func near(value, target point, radius float64) bool {
	deltaX := value.x - target.x
	deltaY := value.y - target.y
	return deltaX*deltaX+deltaY*deltaY <= radius*radius
}

func isCyan(r, g, b uint32) bool {
	return r < 150 && g > 150 && b > 180 && b+30 > g
}

func abs(value int) int {
	if value < 0 {
		return -value
	}
	return value
}
